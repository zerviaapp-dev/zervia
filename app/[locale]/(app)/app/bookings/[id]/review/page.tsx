import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { ReviewForm } from '@/components/booking/ReviewForm';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

/**
 * Leave-a-review page. Triple-guarded: only the booking customer, only
 * when completed, only when no review exists yet. The DB trigger is the
 * final enforcer — this page just keeps the UX honest.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
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

  const { data: booking } = (await supabase
    .from('bookings')
    .select('id, customer_id, status, providers(business_name)')
    .eq('id', id)
    .maybeSingle()) as {
    data: {
      id: string;
      customer_id: string;
      status: string;
      providers: { business_name: string } | null;
    } | null;
  };

  const { data: existing } = booking
    ? await supabase
        .from('reviews')
        .select('id')
        .eq('booking_id', booking.id)
        .maybeSingle()
    : { data: null };

  if (
    !booking ||
    booking.customer_id !== user.id ||
    booking.status !== 'completed' ||
    existing
  ) {
    redirect(localizedPath(`/app/bookings/${id}`, locale));
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('reviewTitle')}</h1>
      <p className="text-base text-brand-800">
        {t('reviewSubtitle', {
          business: booking.providers?.business_name ?? '',
        })}
      </p>
      <Panel>
        <ReviewForm bookingId={booking.id} />
      </Panel>
    </div>
  );
}
