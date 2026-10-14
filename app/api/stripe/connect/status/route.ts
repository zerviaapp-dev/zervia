import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Return the caller's Connect onboarding/payout status for the
 * provider payouts dashboard.
 */
export async function GET(_req: NextRequest) {
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
    .select(
      'id, stripe_connect_account_id, stripe_connect_onboarding_complete, stripe_connect_charges_enabled, stripe_connect_payouts_enabled'
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (!provider) {
    return NextResponse.json({ error: 'not_a_provider' }, { status: 403 });
  }

  const p = provider as {
    id: string;
    stripe_connect_account_id: string | null;
    stripe_connect_onboarding_complete: boolean;
    stripe_connect_charges_enabled: boolean;
    stripe_connect_payouts_enabled: boolean;
  };

  // Recent payouts for this provider.
  const { data: payouts } = await supabase
    .from('payouts')
    .select('id, amount_cents, platform_fee_cents, currency, status, created_at, paid_at, booking_id')
    .eq('provider_id', p.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const totalPaid =
    (payouts ?? []).reduce(
      (sum: number, r: { status: string; amount_cents: number }) =>
        r.status === 'paid' ? sum + r.amount_cents : sum,
      0
    );

  return NextResponse.json({
    hasAccount: Boolean(p.stripe_connect_account_id),
    onboardingComplete: p.stripe_connect_onboarding_complete,
    chargesEnabled: p.stripe_connect_charges_enabled,
    payoutsEnabled: p.stripe_connect_payouts_enabled,
    readyForPayouts:
      p.stripe_connect_onboarding_complete && p.stripe_connect_payouts_enabled,
    totalPaidCents: totalPaid,
    payouts: payouts ?? [],
  });
}
