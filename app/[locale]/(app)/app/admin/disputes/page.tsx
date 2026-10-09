import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { resolveDispute } from '@/lib/supabase/moderation-actions';

type DisputedBooking = {
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
 * Admin dispute resolution: disputed bookings from Phase 3, with
 * resolve-as-completed / resolve-as-cancelled + an admin note.
 * Refunds happen in Stripe (v1 never holds customer money); the note
 * documents what was agreed. Defence in depth: middleware + server check.
 */
export default async function AdminDisputesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Moderation' });
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

  const { data } = (await supabase
    .from('bookings')
    .select(
      'id, scheduled_at, dispute_reason, created_at, listings(title), providers(business_name), customer:profiles!bookings_customer_id_fkey(display_name), reporter:profiles!bookings_disputed_by_fkey(display_name)'
    )
    .eq('status', 'disputed')
    .order('created_at', { ascending: true })) as {
    data: DisputedBooking[] | null;
  };
  const queue = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('disputesTitle')}</h1>
      <p className="text-base text-brand-700">{t('disputesSubtitle')}</p>

      {queue.length === 0 ? (
        <Panel>
          <p className="text-base text-brand-700">{t('queueEmpty')}</p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {queue.map((booking) => (
            <li key={booking.id}>
              <Panel>
                <p className="text-base font-semibold text-brand-900">
                  {booking.listings?.title ?? t('unknownTarget')}
                </p>
                <p className="text-sm text-brand-700">
                  {t('disputeParties', {
                    customer: booking.customer?.display_name ?? t('unknownUser'),
                    provider: booking.providers?.business_name ?? t('unknownUser'),
                  })}
                </p>
                <p className="text-sm text-brand-700">
                  {t('reportedBy', { name: booking.reporter?.display_name ?? t('unknownUser') })}
                </p>
                {booking.dispute_reason && (
                  <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
                    {booking.dispute_reason}
                  </p>
                )}

                <form action={resolveDispute} className="mt-4 space-y-3">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <fieldset>
                    <legend className="mb-2 text-base font-semibold text-brand-900">
                      {t('resolutionLabel')}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      <label className="flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl border-2 border-brand-100 px-4 has-checked:border-brand-600 has-checked:bg-brand-50">
                        <input
                          type="radio"
                          name="outcome"
                          value="completed"
                          required
                          className="h-5 w-5 accent-brand-600"
                        />
                        <span className="text-base text-brand-900">{t('resolveCompleted')}</span>
                      </label>
                      <label className="flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl border-2 border-brand-100 px-4 has-checked:border-brand-600 has-checked:bg-brand-50">
                        <input
                          type="radio"
                          name="outcome"
                          value="cancelled"
                          className="h-5 w-5 accent-brand-600"
                        />
                        <span className="text-base text-brand-900">{t('resolveCancelled')}</span>
                      </label>
                    </div>
                  </fieldset>
                  <div>
                    <label
                      htmlFor={`note-${booking.id}`}
                      className="mb-2 block text-base font-semibold text-brand-900"
                    >
                      {t('resolutionNoteLabel')}
                    </label>
                    <textarea
                      id={`note-${booking.id}`}
                      name="note"
                      rows={2}
                      maxLength={2000}
                      placeholder={t('resolutionNotePlaceholder')}
                      className="w-full rounded-2xl border-2 border-brand-100 px-4 py-3 text-base text-brand-900 placeholder:text-brand-300 focus:border-brand-600 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700"
                  >
                    {t('resolveDispute')}
                  </button>
                </form>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
