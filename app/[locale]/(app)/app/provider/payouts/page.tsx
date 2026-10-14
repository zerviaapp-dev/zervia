import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { PayoutSetup } from '@/components/provider/PayoutSetup';

type PayoutRow = {
  id: string;
  amount_cents: number;
  platform_fee_cents: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  booking_id: string | null;
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function statusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'processing':
      return 'Processing';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'canceled':
      return 'Canceled';
    default:
      return status;
  }
}

/**
 * Provider payouts page: Stripe Connect onboarding + payout history.
 * Providers must complete Connect onboarding before they can receive
 * payouts. All money movement goes through Stripe — Zervia never holds
 * provider funds beyond the escrow hold period.
 */
export default async function ProviderPayoutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Provider' });

  const supabase = await createClient();
  if (!supabase) redirect(localizedPath('/login', locale));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(localizedPath('/login', locale));

  const { data: provider, error: providerError } = await supabase
    .from('providers')
    .select(
      'id, stripe_connect_account_id, stripe_connect_onboarding_complete, stripe_connect_payouts_enabled, subscription_tier'
    )
    .eq('user_id', user.id)
    .maybeSingle();

  // If the providers query itself fails (e.g. Connect columns missing
  // because migration 0037 has not applied yet), show a friendly
  // "not yet available" state instead of bouncing to onboarding.
  if (providerError) {
    console.error('[provider/payouts] provider query failed', providerError.message);
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">{t('payoutsTitle', { default: 'Payouts' })}</h1>
        <div className="rounded-lg border bg-white p-6">
          <p className="text-gray-600">
            {t('payoutsNotAvailable', {
              default:
                'Payouts are not available yet — we are finishing the setup on our end. Please check back soon.',
            })}
          </p>
        </div>
      </div>
    );
  }

  if (!provider) redirect(localizedPath('/app/provider/onboarding', locale));

  const p = provider as {
    id: string;
    stripe_connect_account_id: string | null;
    stripe_connect_onboarding_complete: boolean;
    stripe_connect_payouts_enabled: boolean;
    subscription_tier: string;
  };

  const { data: payouts } = await supabase
    .from('payouts')
    .select('id, amount_cents, platform_fee_cents, currency, status, created_at, paid_at, booking_id')
    .eq('provider_id', p.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (payouts ?? []) as PayoutRow[];
  const totalPaid = rows
    .filter((r) => r.status === 'paid')
    .reduce((s, r) => s + r.amount_cents, 0);
  const pending = rows
    .filter((r) => ['pending', 'processing'].includes(r.status))
    .reduce((s, r) => s + r.amount_cents, 0);

  const feePct = p.subscription_tier === 'pro' || p.subscription_tier === 'business' ? 5 : 10;
  const ready = p.stripe_connect_onboarding_complete && p.stripe_connect_payouts_enabled;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">{t('payoutsTitle', { default: 'Payouts' })}</h1>

      {sp.onboarding === 'done' && (
        <div className="rounded-lg bg-green-50 p-4 text-green-800">
          {t('payoutsOnboardingDone', {
            default: 'Thanks! Your payout setup is being verified — this usually takes a few minutes.',
          })}
        </div>
      )}
      {sp.onboarding === 'refresh' && (
        <div className="rounded-lg bg-amber-50 p-4 text-amber-800">
          {t('payoutsOnboardingRefresh', {
            default: 'Your previous session expired. Please start setup again below.',
          })}
        </div>
      )}

      {/* Connect status card */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-2">
          {t('payoutsSetupTitle', { default: 'Payout account' })}
        </h2>
        {!ready ? (
          <div className="space-y-4">
            <p className="text-gray-600">
              {t('payoutsSetupDesc', {
                default: `To receive payments, connect your bank account through Stripe. Zervia takes a ${feePct}% platform fee on each completed booking; the rest goes straight to you.`,
              })}
            </p>
            <PayoutSetup locale={locale} />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-green-700 font-medium">
              {t('payoutsReady', { default: '✓ Your payout account is active.' })}
            </p>
            <PayoutSetup locale={locale} showDashboardLink />
          </div>
        )}
      </div>

      {/* Earnings summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-500">
            {t('payoutsTotalPaid', { default: 'Total paid out' })}
          </p>
          <p className="text-2xl font-bold">{formatMoney(totalPaid, 'cad')}</p>
        </div>
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-500">
            {t('payoutsPending', { default: 'Pending' })}
          </p>
          <p className="text-2xl font-bold">{formatMoney(pending, 'cad')}</p>
        </div>
      </div>

      {/* Payout history */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">
          {t('payoutsHistory', { default: 'Payout history' })}
        </h2>
        {rows.length === 0 ? (
          <p className="text-gray-500">
            {t('payoutsEmpty', { default: 'No payouts yet. Complete a booking to earn your first payout.' })}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Fee ({feePct}%)</th>
                  <th className="pb-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4 font-medium">
                      {formatMoney(r.amount_cents, r.currency)}
                    </td>
                    <td className="py-2 pr-4 text-gray-500">
                      {formatMoney(r.platform_fee_cents, r.currency)}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          r.status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : r.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
