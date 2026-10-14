import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { BookingRequestForm } from '@/components/booking/BookingRequestForm';
import { createClient } from '@/lib/supabase/server';
import { getBookableSlots } from '@/lib/supabase/slots';
import { localizedPath } from '@/lib/locale-path';

/**
 * Booking request form for a listing. Requires sign-in (anonymous visitors
 * are bounced to login with a return trip). The listing must be publicly
 * visible — RLS decides; anything else → 404, never a hint it exists.
 *
 * `?notes=` pre-fills the notes field (used by one-tap rebook).
 * When the provider has a weekly availability schedule, open slots for
 * the next 14 days are offered as a tap-to-pick calendar.
 */
export default async function BookingRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ notes?: string }>;
}) {
  const { locale, id } = await params;
  const { notes } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Bookings' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `${localizedPath('/login', locale)}?next=${encodeURIComponent(
        localizedPath(`/listings/${id}/book/new`, locale)
      )}`
    );
  }

  const { data: listing } = (await supabase
    .from('listings')
    .select('id, title, providers!inner(business_name)')
    .eq('id', id)
    .maybeSingle()) as {
    data: {
      id: string;
      title: string;
      providers: { business_name: string };
    } | null;
  };

  if (!listing) {
    notFound();
  }

  const slots = await getBookableSlots(listing.id);

  return (
    <div className="space-y-5">
      <Link
        href={`/listings/${id}`}
        className="inline-flex min-h-[44px] items-center text-base font-semibold text-brand-700"
      >
        ← {listing.title}
      </Link>

      <h1 className="text-3xl font-bold text-brand-900">{t('requestTitle')}</h1>
      <p className="text-base text-brand-800">
        {t('requestSubtitle', { business: listing.providers.business_name })}
      </p>

      <Panel>
        <BookingRequestForm
          listingId={listing.id}
          slots={slots}
          defaultNotes={typeof notes === 'string' ? notes.slice(0, 2000) : undefined}
        />
      </Panel>
    </div>
  );
}
