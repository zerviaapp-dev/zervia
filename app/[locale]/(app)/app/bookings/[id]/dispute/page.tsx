import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { DisputeForm } from '@/components/booking/DisputeForm';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

/**
 * Dispute form page. Either party may dispute a pending/confirmed booking;
 * the reason (10+ chars) is required by the DB trigger. Admin resolution
 * UI arrives in Phase 6 — disputed bookings land in the admin queue.
 */
export default async function DisputePage({
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
    .select('id, customer_id, provider_id, status')
    .eq('id', id)
    .maybeSingle()) as {
    data: {
      id: string;
      customer_id: string;
      provider_id: string;
      status: string;
    } | null;
  };

  const { data: providerRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const isParty =
    booking &&
    ['pending', 'confirmed'].includes(booking.status) &&
    (booking.customer_id === user.id ||
      providerRow?.id === booking.provider_id);

  if (!isParty) {
    redirect(localizedPath(`/app/bookings/${id}`, locale));
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('disputeTitle')}</h1>
      <p className="text-base text-brand-800">{t('disputeSubtitle')}</p>
      <Panel>
        <DisputeForm bookingId={id} />
      </Panel>
    </div>
  );
}
