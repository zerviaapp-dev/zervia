import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import {
  BookingCard,
  type BookingCardItem,
} from '@/components/booking/BookingCard';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

type Row = {
  id: string;
  scheduled_at: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'disputed';
  created_at: string;
  listings: { id: string; title: string } | null;
  providers: { business_name: string } | null;
};

/**
 * Customer's bookings ("My bookings"). RLS guarantees a customer only ever
 * sees their own rows; the eq(customer_id) filter is belt-and-suspenders.
 */
export default async function MyBookingsPage({
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

  const { data } = (await supabase
    .from('bookings')
    .select(
      'id, scheduled_at, status, created_at, listings(id, title), providers(business_name)'
    )
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })) as { data: Row[] | null };
  const bookings = data ?? [];

  const statusKey = {
    pending: 'statusPending',
    confirmed: 'statusConfirmed',
    completed: 'statusCompleted',
    cancelled: 'statusCancelled',
    disputed: 'statusDisputed',
  } as const;

  function scheduledText(scheduledAt: string | null): string {
    if (!scheduledAt) return t('scheduledFlexible');
    return `${t('scheduledFor')} ${new Date(scheduledAt).toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })}`;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('myBookings')}</h1>

      {bookings.length === 0 ? (
        <Panel>
          <p className="text-lg font-semibold text-brand-900">{t('noBookings')}</p>
          <p className="mt-1 text-base text-brand-700">{t('noBookingsHint')}</p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const item: BookingCardItem = {
              id: b.id,
              scheduled_at: b.scheduled_at,
              status: b.status,
              created_at: b.created_at,
              listings: b.listings,
              counterparty: b.providers?.business_name ?? null,
            };
            return (
              <BookingCard
                key={b.id}
                booking={item}
                statusLabel={t(statusKey[b.status])}
                scheduledText={scheduledText(b.scheduled_at)}
                rebookLabel={t('rebookCta')}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
