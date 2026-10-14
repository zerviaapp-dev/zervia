import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { DataLoadError } from '@/components/admin/DataLoadError';
import { GuaranteeClaimButtons } from '@/components/admin/GuaranteeClaimButtons';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

type ClaimRow = {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  category: string;
  reason: string;
  status: string;
  refund_cents: number | null;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  customer: { display_name: string | null } | null;
  provider: { business_name: string | null } | null;
  booking: {
    agreed_price_cents: number | null;
    completed_at: string | null;
    listings: { title: string | null } | null;
  } | null;
};

function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

/**
 * Admin guarantee-claim review queue.
 * Approve refunds the customer from Zervia operating funds (Stripe
 * platform balance) — the provider payout is never clawed back.
 * Defence in depth: middleware + server-side role re-check.
 */
export default async function AdminGuaranteePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  const filter = status === 'all' ? 'all' : status === 'reviewed' ? 'reviewed' : 'pending';

  const supabase = await createClient();
  if (!supabase) {
    return <NotConfigured />;
  }

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

  let claims: ClaimRow[] = [];
  let loadError = false;
  try {
    let query = supabase
      .from('guarantee_claims')
      .select(
        'id, booking_id, customer_id, provider_id, category, reason, status, refund_cents, created_at, reviewed_at, review_note, customer:profiles!guarantee_claims_customer_id_fkey(display_name), provider:providers!guarantee_claims_provider_id_fkey(business_name), booking:bookings!guarantee_claims_booking_id_fkey(agreed_price_cents, completed_at, listings(title))'
      )
      .order('created_at', { ascending: true });
    if (filter === 'pending') query = query.eq('status', 'pending');
    if (filter === 'reviewed') query = query.neq('status', 'pending');
    const { data, error } = (await query) as {
      data: ClaimRow[] | null;
      error: unknown;
    };
    if (error) throw error;
    claims = data ?? [];
  } catch (e) {
    console.error('[admin/guarantee] failed to load claims:', e);
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-brand-900">Guarantee Claims</h1>
        <DataLoadError />
      </div>
    );
  }

  const base = `/${locale}/app/admin/guarantee`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">Guarantee Claims</h1>
        <p className="text-base text-brand-700">
          First-Session Guarantee review queue. Approving refunds the customer from
          Zervia operating funds — the provider keeps their payout.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            ['pending', 'Pending'],
            ['reviewed', 'Reviewed'],
            ['all', 'All'],
          ] as const
        ).map(([key, label]) => (
          <a
            key={key}
            href={key === 'pending' ? base : `${base}?status=${key}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              filter === key
                ? 'bg-brand-600 text-white'
                : 'border border-brand-200 text-brand-700 hover:border-brand-400'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {claims.length === 0 ? (
        <Panel>
          <p className="text-base text-brand-700">No {filter} claims.</p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {claims.map((claim) => (
            <li key={claim.id}>
              <Panel>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold text-brand-900">
                    {claim.booking?.listings?.title ?? 'Booking'} · {claim.category}
                  </p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      claim.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : claim.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {claim.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-brand-700">
                  Customer: {claim.customer?.display_name ?? '—'} · Provider:{' '}
                  {claim.provider?.business_name ?? '—'}
                </p>
                <p className="mt-1 text-sm text-brand-700">
                  Session price: {formatMoney(claim.booking?.agreed_price_cents ?? null)}
                  {claim.refund_cents != null &&
                    ` · Refunded: ${formatMoney(claim.refund_cents)}`}
                </p>
                <p className="mt-1 text-xs text-brand-500">
                  Filed {new Date(claim.created_at).toLocaleString()}
                  {claim.reviewed_at &&
                    ` · Reviewed ${new Date(claim.reviewed_at).toLocaleString()}`}
                </p>
                <blockquote className="mt-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
                  “{claim.reason}”
                </blockquote>
                {claim.review_note && (
                  <p className="mt-2 text-xs text-brand-600">
                    <span className="font-semibold">Internal note:</span> {claim.review_note}
                  </p>
                )}
                {claim.status === 'pending' && (
                  <GuaranteeClaimButtons claimId={claim.id} locale={locale} />
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
