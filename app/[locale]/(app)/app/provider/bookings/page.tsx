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
import { setBookingStatus } from '@/lib/supabase/booking-actions';

type Row = {
  id: string;
  scheduled_at: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'disputed';
  created_at: string;
  listings: { id: string; title: string } | null;
  customer: { display_name: string } | null;
};

/**
 * Provider's incoming booking requests. Only visible when the caller has a
 * provider row; RLS restricts reads to that provider's own bookings.
 */
export default async function ProviderBookingsPage({
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

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!provider) {
    redirect(localizedPath('/app/provider', locale));
  }

  const SELECT_FULL =
    'id, scheduled_at, status, created_at, listings(id, title), customer:profiles!bookings_customer_id_fkey(display_name)';
  const SELECT_MINIMAL = 'id, scheduled_at, status, created_at, listings(id, title)';

  let bookingsResult = (await supabase
    .from('bookings')
    .select(SELECT_FULL)
    .eq('provider_id', provider.id)
    .order('created_at', { ascending: false })) as {
    data: Row[] | null;
    error: { code?: string; message?: string } | null;
  };

  // Fallback to minimal columns if the customer profile join fails
  // (PGRST204 schema cache miss or 42703 undefined column).
  if (bookingsResult.error && ['42703', 'PGRST204'].includes(bookingsResult.error.code || '')) {
    bookingsResult = (await supabase
      .from('bookings')
      .select(SELECT_MINIMAL)
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false })) as {
      data: Row[] | null;
      error: { code?: string; message?: string } | null;
    };
  }

  const bookings = bookingsResult.data ?? [];

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
      <h1 className="text-3xl font-bold text-brand-900">
        {t('bookingRequests')}
      </h1>

      {bookings.length === 0 ? (
        <Panel>
          <p className="text-lg font-semibold text-brand-900">{t('noRequests')}</p>
          <p className="mt-1 text-base text-brand-700">{t('noRequestsHint')}</p>
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
              counterparty: b.customer?.display_name ?? null,
            };
            return (
              <div key={b.id}>
                <BookingCard
                  booking={item}
                  statusLabel={t(statusKey[b.status])}
                  scheduledText={scheduledText(b.scheduled_at)}
                />
                {b.status === 'pending' && (
                  <div className="mt-2 flex gap-3">
                    <form action={setBookingStatus}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="status" value="confirmed" />
                      <button
                        type="submit"
                        className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        {t('confirmBooking')}
                      </button>
                    </form>
                    <form action={setBookingStatus}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <button
                        type="submit"
                        className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-red-200 bg-white px-6 text-sm font-semibold text-red-700 hover:border-red-400"
                      >
                        {t('declineBooking')}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
