import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured, priceIdFor, boostPriceId, verificationBadgePriceId, featuredWeekPriceId, profileSpotlightPriceId } from '@/lib/stripe';
import { currencyForCountry } from '@/lib/currency';
import { localizedPath } from '@/lib/locale-path';
import { takeAsync } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type CheckoutBody = {
  kind?: 'subscription' | 'boost' | 'verification_badge' | 'featured_week' | 'profile_spotlight';
  tier?: 'pro' | 'business';
  interval?: 'month' | 'year';
  listingId?: string;
  locale?: string;
};

/**
 * Create a Stripe Checkout Session for a provider subscription, a
 * $9 featured boost, or one of the one-time purchases (verification
 * badge $29, featured week $15, profile spotlight $19). The caller
 * must be signed in AND own an approved (or pending) provider
 * profile. Amounts always come from Stripe Price IDs (env), never
 * from the request body, so a tampered request can't change the price.
 *
 * The 900-points boost alternative lives in the existing points flow
 * (redeemPointsForBoost); this route is the card path. Both end with
 * the same boost activation.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  // Abuse guard: 10 checkout creations per IP per hour. Money endpoints
  // get the strictest bucket — card-testing bots hammer these first.
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`stripe_checkout:${ip}`, 10, 60 * 60 * 1000))) {
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

  // The buyer pays in their own (provider-profile) currency. Subscriptions
  // and boosts use per-currency Stripe Price IDs when configured, falling
  // back to the CAD price otherwise.
  const currency = currencyForCountry(
    (provider as { country?: string | null }).country
  );

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const locale = body.locale ?? 'en';
  const h = await headers();
  const origin = h.get('origin') ?? '';
  const successUrl = `${origin}${localizedPath('/app/billing', locale)}?checkout=success`;
  const cancelUrl = `${origin}${localizedPath('/app/billing', locale)}?checkout=cancelled`;

  const stripe = getStripe();

  // Reuse the existing Stripe customer when the provider already has one.
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('provider_id', provider.id)
    .single();

  let customerId: string | undefined = existingSub?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: provider.business_name,
      metadata: { zervia_user_id: user.id, zervia_provider_id: provider.id },
    });
    customerId = customer.id;
  }

  try {
    if (body.kind === 'subscription') {
      const tier = body.tier === 'business' ? 'business' : 'pro';
      const interval = body.interval === 'year' ? 'year' : 'month';
      const priceId = priceIdFor(tier, interval, currency);
      if (!priceId) {
        return NextResponse.json({ error: 'price_not_configured' }, { status: 503 });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          zervia_user_id: user.id,
          zervia_provider_id: provider.id,
          zervia_tier: tier,
          zervia_interval: interval,
        },
        subscription_data: {
          metadata: {
            zervia_user_id: user.id,
            zervia_provider_id: provider.id,
            zervia_tier: tier,
            zervia_interval: interval,
          },
        },
      });
      return NextResponse.json({ url: session.url });
    }

    if (body.kind === 'boost') {
      const listingId = String(body.listingId ?? '');
      if (!listingId) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
      }
      // Trust gate (Phase 5): Featured Boost is earned, not bought —
      // only providers with 10+ completed jobs may boost.
      if ((provider.completed_jobs ?? 0) < 10) {
        return NextResponse.json(
          { error: 'boost_not_eligible' },
          { status: 403 }
        );
      }
      // The listing must belong to this provider (RLS would also block it).
      const { data: listing } = await supabase
        .from('listings')
        .select('id, providers!inner(user_id)')
        .eq('id', listingId)
        .single();
      if (!listing) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      const priceId = boostPriceId(currency);
      if (!priceId) {
        return NextResponse.json({ error: 'price_not_configured' }, { status: 503 });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          zervia_kind: 'boost',
          zervia_user_id: user.id,
          zervia_provider_id: provider.id,
          zervia_listing_id: listingId,
        },
      });
      return NextResponse.json({ url: session.url });
    }

    if (body.kind === 'verification_badge') {
      // The badge rides on the existing ID-verification system: the
      // provider's ID must already be approved before they can buy it.
      if ((provider as { id_verification_status?: string | null }).id_verification_status !== 'approved') {
        return NextResponse.json(
          { error: 'verification_required' },
          { status: 403 }
        );
      }
      if ((provider as { verification_badge?: boolean | null }).verification_badge) {
        return NextResponse.json({ error: 'already_purchased' }, { status: 409 });
      }
      const priceId = verificationBadgePriceId(currency);
      if (!priceId) {
        return NextResponse.json({ error: 'price_not_configured' }, { status: 503 });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          zervia_kind: 'verification_badge',
          zervia_user_id: user.id,
          zervia_provider_id: provider.id,
        },
      });
      return NextResponse.json({ url: session.url });
    }

    if (body.kind === 'featured_week') {
      const listingId = String(body.listingId ?? '');
      if (!listingId) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
      }
      // The listing must belong to this provider (RLS would also block it).
      const { data: listing } = await supabase
        .from('listings')
        .select('id, providers!inner(user_id)')
        .eq('id', listingId)
        .single();
      if (!listing) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      const priceId = featuredWeekPriceId(currency);
      if (!priceId) {
        return NextResponse.json({ error: 'price_not_configured' }, { status: 503 });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          zervia_kind: 'featured_week',
          zervia_user_id: user.id,
          zervia_provider_id: provider.id,
          zervia_listing_id: listingId,
        },
      });
      return NextResponse.json({ url: session.url });
    }

    if (body.kind === 'profile_spotlight') {
      const priceId = profileSpotlightPriceId(currency);
      if (!priceId) {
        return NextResponse.json({ error: 'price_not_configured' }, { status: 503 });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          zervia_kind: 'profile_spotlight',
          zervia_user_id: user.id,
          zervia_provider_id: provider.id,
        },
      });
      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  } catch (err) {
    console.error('[stripe/checkout]', err);
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
  }
}
