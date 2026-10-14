import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { DataLoadError } from '@/components/admin/DataLoadError';
import { StatusChip } from '@/components/booking/BookingCard';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

type DisputedRow = {
  id: string;
  scheduled_at: string | null;
  dispute_reason: string | null;
  created_at: string;
  listings: { title: string } | null;
  providers: { business_name: string } | null;
  customer: { display_name: string } | null;
  reporter: { display_name: string } | null;
};

/**
 * Admin dispute queue: all bookings with status='disputed', oldest first.
 * Each card links to the booking detail page, where the admin-only
 * DisputeResolutionPanel offers release-to-provider / refund-to-customer
 * actions (Phase 3). Defence in depth: middleware redirects non-admins
 * away from /app/admin/* AND this page re-checks the role server-side.
 */
export default async function AdminDisputesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Bookings' });
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

  let queue: DisputedRow[] = [];
  let loadError = false;
  try {
    const { data, error } = (await supabase
      .from('bookings')
      .select(
        'id, scheduled_at, dispute_reason, created_at, listings(title), providers(business_name), customer:profiles!bookings_customer_id_fkey(display_name), reporter:profiles!bookings_disputed_by_fkey(display_name)'
      )
      .eq('status', 'disputed')
      .order('created_at', { ascending: true })) as {
      data: DisputedRow[] | null;
      error: unknown;
    };
    if (error) throw error;
    queue = data ?? [];
  } catch (e) {
    console.error('[admin/bookings] failed to load dispute queue:', e);
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-brand-900">{t('disputesTitle')}</h1>
        <DataLoadError />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('disputesTitle')}</h1>
      <Panel>
        <p className="text-base text-brand-700">{t('adminNote')}</p>
      </Panel>

      {queue.length === 0 ? (
        <Panel>
          <p className="text-lg font-semibold text-brand-900">{t('noDisputes')}</p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {queue.map((b) => (
            <Link key={b.id} href={`/app/bookings/${b.id}`} className="block">
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-lg font-bold text-brand-900">
                    {b.listings?.title ?? '—'}
                  </p>
                  <StatusChip status="disputed" label={t('statusDisputed')} />
                </div>
                <p className="mt-1 text-sm font-semibold text-brand-700">
                  {b.providers?.business_name ?? '—'} ·{' '}
                  {b.customer?.display_name ?? '—'}
                </p>
                <p className="mt-2 text-sm text-brand-700">
                  <span className="font-semibold">{t('disputeBy')}:</span>{' '}
                  {b.reporter?.display_name ?? '—'}
                </p>
                {b.dispute_reason ? (
                  <p className="mt-1 text-sm text-brand-700">
                    <span className="font-semibold">{t('disputeReason')}:</span>{' '}
                    {b.dispute_reason}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-brand-500">
                  {new Date(b.created_at).toLocaleString(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
