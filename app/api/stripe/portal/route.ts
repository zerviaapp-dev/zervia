import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { localizedPath } from '@/lib/locale-path';

export const runtime = 'nodejs';

/**
 * Create a Stripe Customer Portal session so the provider can upgrade,
 * downgrade, update their card, or cancel — all inside Stripe's hosted
 * UI. We never see or store card details.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
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
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!provider) {
    return NextResponse.json({ error: 'not_a_provider' }, { status: 403 });
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('provider_id', provider.id)
    .single();
  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 404 });
  }

  let locale = 'en';
  try {
    const body = (await req.json()) as { locale?: string };
    if (typeof body.locale === 'string' && body.locale) locale = body.locale;
  } catch {
    /* locale stays default */
  }

  const h = await headers();
  const origin = h.get('origin') ?? '';
  const returnUrl = `${origin}${localizedPath('/app/billing', locale)}`;

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id as string,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/portal]', err);
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
  }
}
