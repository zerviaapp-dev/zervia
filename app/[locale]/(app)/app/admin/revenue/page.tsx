import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { formatPrice, tierPriceCents } from '@/lib/pricing';

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Admin revenue overview: total collected, monthly recurring revenue,
 * active subscriptions, and recent payments. Admin-gated by middleware
 * plus a server-side role re-check (defence in depth).
 */
export default async function RevenuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Billing' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizedPath('/login', locale));
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    redirect(localizedPath('/app/dashboard', locale));
  }

  const [{ data: transactions }, { data: subs }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, amount_cents, type, status, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('subscriptions')
      .select('tier, billing_interval, status')
      .in('status', ['active', 'trialing']),
  ]);

  const total = (transactions ?? [])
    .filter((r) => r.status === 'succeeded')
    .reduce((s, r) => s + (r.amount_cents as number), 0);

  const mrr = (subs ?? []).reduce((s, r) => {
    const tier = r.tier as 'pro' | 'business';
    const interval = r.billing_interval as 'month' | 'year';
    const cents = tierPriceCents(tier, interval);
    return s + (interval === 'month' ? cents : Math.round(cents / 12));
  }, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">{t('revenueTitle')}</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel>
          <p className="text-sm font-semibold text-brand-600">{t('revenueTotal')}</p>
          <p className="text-3xl font-bold text-brand-900">{formatPrice(total)}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-brand-600">{t('revenueMrr')}</p>
          <p className="text-3xl font-bold text-brand-900">{formatPrice(mrr)}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-brand-600">{t('revenueActiveSubs')}</p>
          <p className="text-3xl font-bold text-brand-900">{(subs ?? []).length}</p>
        </Panel>
      </div>

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('revenueRecent')}</h2>
        {!transactions || transactions.length === 0 ? (
          <p className="mt-2 text-base text-brand-700">{t('invoicesEmpty')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="text-sm text-brand-600">
                  <th className="py-2 pr-4 font-semibold">{t('colDate')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('colType')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('colAmount')}</th>
                  <th className="py-2 font-semibold">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id as string} className="border-t border-brand-100 text-brand-900">
                    <td className="py-2 pr-4">{formatDate(tx.created_at as string, locale)}</td>
                    <td className="py-2 pr-4">{tx.type as string}</td>
                    <td className="py-2 pr-4 font-semibold">{formatPrice(tx.amount_cents as number)}</td>
                    <td className="py-2">{tx.status as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
