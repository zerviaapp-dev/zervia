import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPayPalConfigured, paypalApi, centsToPayPalValue, type PayPalCapture } from '@/lib/paypal';
import { currencyForCountry, convertCadCents } from '@/lib/currency';
import { localizedPath } from '@/lib/locale-path';
import { takeAsync } from '@/lib/rate-limit';
import {
  BOOST_CENTS,
  VERIFICATION_BADGE_CENTS,
  FEATURED_WEEK_CENTS,
  PROFILE_SPOTLIGHT_CENTS,
} from '@/lib/pricing';
import {
  fulfillPayPalOneTimePurchase,
  type OneTimeKind,
} from '@/lib/billing-fulfillment';
import {
  runCaptureFlow,
  type FlowAdmin,
  type FlowCapture,
  type FulfillArgs,
} from '@/lib/billing/capture-idempotency';
import { isBillingLive } from '@/lib/booking-flag';

export const runtime = 'nodejs';

const KIND_CENTS: Record<OneTimeKind, number> = {
  boost: BOOST_CENTS,
  verification_badge: VERIFICATION_BADGE_CENTS,
  featured_week: FEATURED_WEEK_CENTS,
  profile_spotlight: PROFILE_SPOTLIGHT_CENTS,
};

const KIND_DESCRIPTION: Record<OneTimeKind, string> = {
  boost: 'Featured boost (7 days) — via PayPal',
  verification_badge: 'Verification badge (one-time) — via PayPal',
  featured_week: 'Featured week (7 days, top placement) — via PayPal',
  profile_spotlight: 'Profile spotlight (7 days) — via PayPal',
};

type CustomId = {
  kind: OneTimeKind;
  user_id: string;
  provider_id: string;
  listing_id: string | null;
  amount_cents: number;
  currency: string;
};

/**
 * PayPal return URL. The buyer approved the order on PayPal; we now
 * capture it server-side, verify the amount against server truth,
 * and fulfill the purchase (same activation as the Stripe path).
 *
 * Money-safety rules:
 * 1. The order's AUTHORIZED amount must EXACTLY match the
 *    server-computed price for the kind + provider currency BEFORE the
 *    claim insert and BEFORE any capture call; the captured amount is
 *    re-verified after capture. A mismatch aborts — the buyer is not
 *    charged a wrong amount and nothing is activated.
 * 2. Durable completion states on `paypal_orders`
 *    (lib/billing/capture-idempotency.ts):
 *      claimed → capturing → captured → fulfilled
 *                    └→ failed (terminal: operator reconciles)
 *    The idempotency claim is inserted BEFORE capture and the insert
 *    result is discriminated: a unique violation (duplicate) reads the
 *    row's status — 'fulfilled' returns success with ZERO capture
 *    calls (this was the confirmed defect: the old route called the
 *    PayPal capture API on duplicates); 'failed' returns the failure
 *    page, never a re-capture or a false success; 'captured' runs
 *    fulfillment once as crash recovery (amount re-verified, ledger-
 *    guarded, never re-captured); 'claimed'/'capturing' race for the
 *    capture via an atomic claimed→capturing compare-and-set — the
 *    first sighting takes it too, so a duplicate arriving mid-capture
 *    cannot issue a second capture call. A race loser only reports
 *    success on observing 'fulfilled'. Any other DB error aborts
 *    BEFORE capture — a double return (or a replayed return URL)
 *    fulfills at most once, and a buyer is never charged on an
 *    untracked claim.
 * 3. All writes use the service-role client; the return URL carries no
 *    session, so nothing here trusts the requester.
 */
export async function GET(req: NextRequest) {
  // BILLING GATE (Oct 23, 2026, audit finding Z-1 sweep): capture is the
  // step that actually charges the buyer. While BILLING_LIVE is off no
  // capture may complete — /api/paypal/checkout is gated, so no new
  // order can legitimately reach this point while billing is paused.
  if (!isBillingLive()) {
    return NextResponse.json({ error: 'billing_paused' }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin || !isPayPalConfigured()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`paypal_capture:${ip}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const token = req.nextUrl.searchParams.get('token'); // PayPal order id
  const locale = req.nextUrl.searchParams.get('locale') ?? 'en';
  const failUrl = localizedPath('/app/billing', locale);
  const okUrl = `${failUrl}?checkout=success`;

  if (!token) return NextResponse.redirect(new URL(`${failUrl}?checkout=cancelled`, req.url));

  try {
    // 1. Fetch the order to read our custom_id (server-written at creation).
    const order = await paypalApi<{
      id: string;
      status: string;
      purchase_units?: {
        custom_id?: string;
        amount?: { currency_code: string; value: string };
        payments?: {
          captures?: {
            id: string;
            status: string;
            amount?: { currency_code: string; value: string };
          }[];
        };
      }[];
    }>(`/v2/checkout/orders/${token}`);
    const raw = order.purchase_units?.[0]?.custom_id;
    if (!raw) {
      console.error('[paypal/capture] order missing custom_id', token);
      return NextResponse.redirect(new URL(failUrl, req.url));
    }
    let custom: CustomId;
    try {
      custom = JSON.parse(raw) as CustomId;
    } catch {
      console.error('[paypal/capture] bad custom_id', token);
      return NextResponse.redirect(new URL(failUrl, req.url));
    }
    if (!KIND_CENTS[custom.kind]) {
      console.error('[paypal/capture] unknown kind', custom.kind);
      return NextResponse.redirect(new URL(failUrl, req.url));
    }

    // Read-only capture details from this GET (present when PayPal
    // already captured the order, i.e. on a duplicate return). Passed
    // to the flow ONLY for the crash-recovery amount re-verification —
    // it never triggers a capture call.
    const oc = order.purchase_units?.[0]?.payments?.captures?.[0];
    const orderCapture: FlowCapture | null = oc?.id
      ? {
          id: oc.id,
          status: oc.status,
          amountValue: oc.amount?.value ?? '0',
          amountCurrency: oc.amount?.currency_code ?? '',
        }
      : null;

    // Read-only AUTHORIZED amount from the same GET. The flow validates
    // it against server truth BEFORE the claim insert and BEFORE any
    // capture call (F-CAP-5 bulk-fix: amount was previously only
    // checked after capture).
    const authorizedAmount = order.purchase_units?.[0]?.amount ?? null;

    // 2. Durable capture flow (status machine). Returns ok:true → the
    //    success page, ok:false → the failure page.
    const result = await runCaptureFlow({
      // Structural cast: the flow only uses the from/insert/select/
      // update/eq/in/single surface declared on FlowAdmin, which the
      // supabase-js client satisfies.
      admin: admin as unknown as FlowAdmin,
      orderId: token,
      custom: {
        kind: custom.kind,
        user_id: custom.user_id,
        provider_id: custom.provider_id,
        listing_id: custom.listing_id,
        currency: custom.currency,
      },
      description: KIND_DESCRIPTION[custom.kind],
      captureOrder: async (orderId: string) => {
        const capture = await paypalApi<PayPalCapture>(
          `/v2/checkout/orders/${orderId}/capture`,
          { method: 'POST' }
        );
        const cap = capture.purchase_units?.[0]?.payments?.captures?.[0];
        return {
          id: cap?.id ?? '',
          status: cap?.status ?? '',
          amountValue: cap?.amount?.value ?? '0',
          amountCurrency: cap?.amount?.currency_code ?? '',
        };
      },
      orderCapture,
      authorizedAmount,
      fulfill: (args: FulfillArgs) =>
        fulfillPayPalOneTimePurchase(admin, {
          kind: args.kind,
          userId: args.userId,
          providerId: args.providerId,
          listingId: args.listingId,
          paypalOrderId: args.paypalOrderId,
          paypalCaptureId: args.paypalCaptureId,
          amountCents: args.amountCents,
          currency: args.currency,
          description: args.description,
        }),
      resolveExpected: async () => {
        const { data: provider } = await admin
          .from('providers')
          .select('country')
          .eq('id', custom.provider_id)
          .single();
        const currency = currencyForCountry(
          (provider as { country?: string | null } | null)?.country
        );
        return {
          expectedCents: convertCadCents(KIND_CENTS[custom.kind], currency),
          currency,
        };
      },
      toPayPalValue: centsToPayPalValue,
    });

    // Independent-review hardening (Nov 2): the success page is only
    // reachable on PROVEN fulfillment (terminalStatus === 'fulfilled').
    // Any ok:true without a fulfilled terminal state would be a false
    // success — it routes to the failure page instead.
    const fulfilled = result.ok && result.terminalStatus === 'fulfilled';
    return NextResponse.redirect(
      new URL(fulfilled ? okUrl : failUrl, req.url)
    );
  } catch (err) {
    console.error('[paypal/capture]', err);
    return NextResponse.redirect(new URL(failUrl, req.url));
  }
}
