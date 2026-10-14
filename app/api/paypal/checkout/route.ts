import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isPayPalConfigured, paypalApi, paypalMode, centsToPayPalValue, type PayPalOrder } from '@/lib/paypal';
import { currencyForCountry, convertCadCents } from '@/lib/currency';
import { localizedPath } from '@/lib/locale-path';
import { takeAsync } from '@/lib/rate-limit';
import {
  BOOST_CENTS,
  VERIFICATION_BADGE_CENTS,
  FEATURED_WEEK_CENTS,
  PROFILE_SPOTLIGHT_CENTS,
} from '@/lib/pricing';
import type { OneTimeKind } from '@/lib/billing-fulfillment';
import { getSiteOrigin } from '@/lib/site-origin';

export const runtime = 'nodejs';

type PayPalCheckoutBody = {
  kind?: OneTimeKind;
  listingId?: string;
  locale?: string;
};

const KIND_META: Record<OneTimeKind, { cents: number; name: string; description: string }> = {
  boost: {
    cents: BOOST_CENTS,
    name: 'Zervia Featured Boost',
    description: 'Featured boost — 7 days of top placement for one listing',
  },
  verification_badge: {
    cents: VERIFICATION_BADGE_CENTS,
    name: 'Zervia Verification Badge',
    description: 'Verification badge — permanent "Verified" badge on the provider profile',
  },
  featured_week: {
    cents: FEATURED_WEEK_CENTS,
    name: 'Zervia Featured Week',
    description: 'Featured week — listing pinned at the top of Discover for 7 days',
  },
  profile_spotlight: {
    cents: PROFILE_SPOTLIGHT_CENTS,
    name: 'Zervia Profile Spotlight',
    description: 'Profile spotlight — provider profile highlighted on Discover for 7 days',
  },
};

/**
 * Create a PayPal order for a one-time purchase (featured boost $9,
 * verification badge $29, featured week $15, profile spotlight $19).
 *
 * Mirrors the trust gates of /api/stripe/checkout: the caller must be
 * a signed-in provider, boost needs 10+ completed jobs and ownership
 * of the listing, the badge needs approved ID verification and must
 * not already be owned. Amounts come from server constants
 * (lib/pricing.ts), never from the request body.
 *
 * Returns { approvalUrl } — the client redirects the buyer to PayPal.
 * After approval, PayPal returns them to /api/paypal/capture which
 * captures the payment and fulfills the purchase.
 */
export async function POST(req: NextRequest) {
  if (!isPayPalConfigured()) {
    return NextResponse.json({ error: 'paypal_not_configured' }, { status: 503 });
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`paypal_checkout:${ip}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: provider } = await supabase
    .from('providers')
    .select('id, business_name, status, completed_jobs, country, id_verification_status, verification_badge')
    .eq('user_id', user.id)
    .single();
  if (!provider) {
    return NextResponse.json({ error: 'not_a_provider' }, { status: 403 });
  }

  let body: PayPalCheckoutBody;
  try {
    body = (await req.json()) as PayPalCheckoutBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const kind = body.kind;
  if (!kind || !KIND_META[kind]) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const listingId = body.listingId ? String(body.listingId) : null;

  // --- Trust gates (same as Stripe path) ---
  if (kind === 'boost' || kind === 'featured_week') {
    if (!listingId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    if (kind === 'boost' && (provider.completed_jobs ?? 0) < 10) {
      return NextResponse.json({ error: 'boost_not_eligible' }, { status: 403 });
    }
    const { data: listing } = await supabase
      .from('listings')
      .select('id, providers!inner(user_id)')
      .eq('id', listingId)
      .single();
    if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (kind === 'verification_badge') {
    if ((provider as { id_verification_status?: string | null }).id_verification_status !== 'approved') {
      return NextResponse.json({ error: 'verification_required' }, { status: 403 });
    }
    if ((provider as { verification_badge?: boolean | null }).verification_badge) {
      return NextResponse.json({ error: 'already_purchased' }, { status: 409 });
    }
  }

  const meta = KIND_META[kind];
  const currency = currencyForCountry((provider as { country?: string | null }).country);
  const amountCents = convertCadCents(meta.cents, currency);

  const locale = body.locale ?? 'en';
  const origin = getSiteOrigin(); // SECURE: never trust client Origin header
  const customId = JSON.stringify({
    kind,
    user_id: user.id,
    provider_id: provider.id,
    listing_id: listingId,
    amount_cents: amountCents,
    currency,
  });

  try {
    const order = await paypalApi<PayPalOrder>('/v2/checkout/orders', {
      method: 'POST',
      requestId: `zervia-${kind}-${provider.id}-${Date.now()}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: customId,
            description: meta.description,
            amount: {
              currency_code: currency.toUpperCase(),
              value: centsToPayPalValue(amountCents),
            },
          },
        ],
        application_context: {
          brand_name: 'Zervia',
          user_action: 'PAY_NOW',
          return_url: `${origin}/api/paypal/capture?locale=${locale}`,
          cancel_url: `${origin}${localizedPath('/app/billing', locale)}?checkout=cancelled`,
        },
      },
    });
    const approvalUrl = order.links?.find((l) => l.rel === 'approve')?.href;
    if (!approvalUrl) {
      console.error('[paypal/checkout] no approval link', order.id);
      return NextResponse.json({ error: 'paypal_error' }, { status: 502 });
    }
    return NextResponse.json({ approvalUrl, orderId: order.id, mode: paypalMode() });
  } catch (err) {
    console.error('[paypal/checkout]', err);
    return NextResponse.json({ error: 'paypal_error' }, { status: 502 });
  }
}
