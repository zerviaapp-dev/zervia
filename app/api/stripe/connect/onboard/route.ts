import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { localizedPath } from '@/lib/locale-path';
import { takeAsync } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Create (or reuse) a Stripe Connect Express account for the caller's
 * provider profile and return a Stripe-hosted onboarding link.
 *
 * Flow:
 * 1. Provider clicks "Set up payouts" in their dashboard
 * 2. This route creates an Express account (or reuses existing)
 * 3. Returns an accountLink URL — provider completes KYC on Stripe's site
 * 4. Stripe redirects back to /app/provider/payouts?onboarding=done
 * 5. The `account.updated` webhook marks onboarding complete
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`stripe_connect:${ip}`, 10, 60 * 60 * 1000))) {
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

  // Find the caller's provider row.
  const { data: provider } = await supabase
    .from('providers')
    .select('id, business_name, country, stripe_connect_account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!provider) {
    return NextResponse.json({ error: 'not_a_provider' }, { status: 403 });
  }
  const p = provider as {
    id: string;
    business_name: string;
    country: string | null;
    stripe_connect_account_id: string | null;
  };

  const stripe = getStripe();
  const admin = createAdminClient();
  let accountId = p.stripe_connect_account_id;

  // Create the Express account on first onboarding.
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: (p.country ?? 'CA').toUpperCase().slice(0, 2),
      email: user.email ?? undefined,
      business_profile: { name: p.business_name ?? undefined },
      metadata: {
        zervia_provider_id: p.id,
        zervia_user_id: user.id,
      },
    });
    accountId = account.id;

    if (admin) {
      await admin
        .from('providers')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', p.id);
    }
  }

  // Build refresh + return URLs from the request origin.
  const h = await headers();
  const origin = h.get('origin') ?? '';
  let locale = 'en';
  try {
    const body = (await req.json()) as { locale?: string };
    if (body.locale) locale = body.locale;
  } catch {
    /* locale optional */
  }

  const refreshUrl = `${origin}${localizedPath('/app/provider/payouts', locale)}?onboarding=refresh`;
  const returnUrl = `${origin}${localizedPath('/app/provider/payouts', locale)}?onboarding=done`;

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: link.url, accountId });
}
