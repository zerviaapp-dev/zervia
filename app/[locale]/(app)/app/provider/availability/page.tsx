import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { AvailabilityForm } from '@/components/availability/AvailabilityForm';
import { NextAvailableForm } from '@/components/availability/NextAvailableForm';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

type Slot = {
  weekday: number;
  start_time: string;
  end_time: string;
};

/**
 * Provider availability: weekly schedule + next-available date.
 * Discover uses this to rank available-now providers and power the
 * urgency filter ("Today / This week / Flexible").
 */
export default async function ProviderAvailabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Availability' });
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
    .select('id, next_available_date')
    .eq('user_id', user.id)
    .single();

  if (!provider) {
    redirect(localizedPath('/app/become-provider', locale));
  }

  const { data: slots } = (await supabase
    .from('availability')
    .select('weekday, start_time, end_time')
    .eq('provider_id', provider.id)) as { data: Slot[] | null };

  const byDay = new Map<number, { start: string; end: string }>();
  for (const s of slots ?? []) {
    byDay.set(s.weekday, { start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
        <p className="mt-1 text-base text-brand-700">{t('subtitle')}</p>
      </div>

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('weeklyTitle')}</h2>
        <p className="mt-1 text-sm text-brand-700">{t('weeklyHint')}</p>
        <AvailabilityForm locale={locale} initial={byDay} />
      </Panel>

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('nextTitle')}</h2>
        <p className="mt-1 text-sm text-brand-700">{t('nextHint')}</p>
        <NextAvailableForm
          locale={locale}
          initial={provider.next_available_date ?? ''}
        />
      </Panel>

      <Link
        href={`/app/provider`}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-base font-semibold text-brand-700 hover:bg-brand-50"
      >
        {t('backToDashboard')}
      </Link>
    </div>
  );
}
