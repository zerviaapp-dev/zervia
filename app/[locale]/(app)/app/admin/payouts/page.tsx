import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { RetryPayoutButton } from '@/components/admin/RetryPayoutButton';

type PayoutRow = {
  id: string;
  provider_id: string;
  booking_id: string | null;
  stripe_transfer_id: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  currency: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
  providers: { business_name: string } | null;
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Admin payouts overview: all provider payouts with status.
 * Admin-gated by middleware plus server-side role re-check.
 */
export default async function AdminPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  if (!supabase) redirect(localizedPath('/login', locale));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(localizedPath('/login', locale));

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== 'admin') {
    redirect(localizedPath('/app/dashboard', locale));
  }

  let payouts: PayoutRow[] = [];
  const totals = { paid: 0, pending: 0, failed: 0, fees: 0 };
  try {
    const { data } = await supabase
      .from('payouts')
      .select(
        'id, provider_id, booking_id, stripe_transfer_id, amount_cents, platform_fee_cents, currency, status, failure_reason, created_at, paid_at, providers(business_name)'
      )
      .order('created_at', { ascending: false })
      .limit(100);
    payouts = ((data ?? []) as unknown as PayoutRow[]).map((r) => ({
      ...r,
      providers: Array.isArray(r.providers) ? r.providers[0] ?? null : r.providers,
    }));
    for (const r of payouts) {
      if (r.status === 'paid') {
        totals.paid += r.amount_cents;
        totals.fees += r.platform_fee_cents;
      } else if (['pending', 'processing'].includes(r.status)) {
        totals.pending += r.amount_cents;
      } else if (r.status === 'failed') {
        totals.failed += r.amount_cents;
      }
    }
  } catch (err) {
    console.error('[admin/payouts] query failed', err);
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Provider Payouts</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Total paid out</p>
          <p className="text-xl font-bold">{formatMoney(totals.paid, 'cad')}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-xl font-bold">{formatMoney(totals.pending, 'cad')}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Platform fees collected</p>
          <p className="text-xl font-bold">{formatMoney(totals.fees, 'cad')}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Failed</p>
          <p className="text-xl font-bold text-red-600">{formatMoney(totals.failed, 'cad')}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Recent payouts</h2>
        {payouts.length === 0 ? (
          <p className="text-gray-500">No payouts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Provider</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Fee</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Transfer</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{r.providers?.business_name ?? r.provider_id.slice(0, 8)}</td>
                    <td className="py-2 pr-4 font-medium">{formatMoney(r.amount_cents, r.currency)}</td>
                    <td className="py-2 pr-4 text-gray-500">{formatMoney(r.platform_fee_cents, r.currency)}</td>
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
                        {r.status}
                      </span>
                      {r.status === 'failed' && r.failure_reason && (
                        <p className="text-xs text-red-600 mt-1 max-w-xs truncate" title={r.failure_reason}>
                          {r.failure_reason}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500 font-mono">
                      {r.stripe_transfer_id ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {r.status === 'failed' && (
                        <RetryPayoutButton payoutId={r.id} locale={locale} />
                      )}
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
