import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { takeAsync } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Create a Stripe Express dashboard login link so the provider can
 * view their balance, payouts, and tax documents on Stripe's site.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`stripe_connect_dash:${ip}`, 20, 60 * 60 * 1000))) {
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
    .select('stripe_connect_account_id, stripe_connect_onboarding_complete')
    .eq('user_id', user.id)
    .maybeSingle();

  const p = provider as {
    stripe_connect_account_id: string | null;
    stripe_connect_onboarding_complete: boolean;
  } | null;

  if (!p?.stripe_connect_account_id) {
    return NextResponse.json({ error: 'no_connect_account' }, { status: 409 });
  }
  if (!p.stripe_connect_onboarding_complete) {
    return NextResponse.json({ error: 'onboarding_incomplete' }, { status: 409 });
  }

  const h = await headers();
  void h; // origin not needed for login links

  const stripe = getStripe();
  const link = await stripe.accounts.createLoginLink(p.stripe_connect_account_id);

  return NextResponse.json({ url: link.url });
}
