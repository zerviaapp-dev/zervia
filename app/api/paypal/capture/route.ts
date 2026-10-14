import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPayPalConfigured, paypalApi, centsToPayPalValue, type PayPalCapture } from '@/lib/paypal';
import { currencyForCountry, convertCadCents, asCurrency } from '@/lib/currency';
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
 * 1. The captured amount must EXACTLY match the server-computed price
 *    for the kind + provider currency. A mismatch aborts — the buyer
 *    is not charged a wrong amount and nothing is activated.
 * 2. Idempotency: the PayPal order id is recorded in `paypal_orders`
 *    with ON CONFLICT DO NOTHING before fulfillment. A double return
 *    (or a replayed webhook) fulfills at most once — double
 *    activation is impossible.
 * 3. All writes use the service-role client; the return URL carries no
 *    session, so nothing here trusts the requester.
 */
export async function GET(req: NextRequest) {
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
      purchase_units?: { custom_id?: string }[];
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

    // 2. Idempotency claim BEFORE capture: if we've seen this order,
    //    skip straight to success without re-capturing or re-fulfilling.
    const { data: claimed } = await admin
      .from('paypal_orders')
      .insert({ paypal_order_id: token, kind: custom.kind, provider_id: custom.provider_id })
      .select('paypal_order_id')
      .single();
    const alreadySeen = !claimed;

    // 3. Capture (idempotent on PayPal's side for an approved order —
    //    a second capture of the same order returns the existing one).
    const capture = await paypalApi<PayPalCapture>(`/v2/checkout/orders/${token}/capture`, {
      method: 'POST',
    });
    const cap = capture.purchase_units?.[0]?.payments?.captures?.[0];
    if (!cap || cap.status !== 'COMPLETED') {
      console.error('[paypal/capture] capture not completed', token, cap?.status);
      return NextResponse.redirect(new URL(failUrl, req.url));
    }

    // 4. Verify the amount against server truth: recompute the price
    //    from the kind and the PROVIDER's currency (provider owns the
    //    purchase; their country was stored in custom_id's currency).
    const providerCurrency = asCurrency(custom.currency);
    const { data: provider } = await admin
      .from('providers')
      .select('country')
      .eq('id', custom.provider_id)
      .single();
    const currency = currencyForCountry((provider as { country?: string | null } | null)?.country);
    const expectedCents = convertCadCents(KIND_CENTS[custom.kind], currency);
    const capturedValue = cap.amount?.value ?? '0';
    const expectedValue = centsToPayPalValue(expectedCents);
    if (
      capturedValue !== expectedValue ||
      (cap.amount?.currency_code ?? '').toLowerCase() !== currency
    ) {
      console.error(
        '[paypal/capture] AMOUNT MISMATCH — aborting fulfillment',
        token,
        `captured=${capturedValue} ${cap.amount?.currency_code}`,
        `expected=${expectedValue} ${currency}`
      );
      return NextResponse.redirect(new URL(failUrl, req.url));
    }

    // 5. Fulfill once.
    if (!alreadySeen) {
      await fulfillPayPalOneTimePurchase(admin, {
        kind: custom.kind,
        userId: custom.user_id,
        providerId: custom.provider_id,
        listingId: custom.listing_id,
        paypalOrderId: token,
        paypalCaptureId: cap.id,
        amountCents: expectedCents,
        currency,
        description: KIND_DESCRIPTION[custom.kind],
      });
    }
    return NextResponse.redirect(new URL(okUrl, req.url));
  } catch (err) {
    console.error('[paypal/capture]', err);
    return NextResponse.redirect(new URL(failUrl, req.url));
  }
}
