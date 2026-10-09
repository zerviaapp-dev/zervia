import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countryName } from '@/lib/countries';
import { getBalance } from '@/lib/supabase/rewards-actions';

/** Protected home screen: greeting, live stats, account facts, next steps. */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tb = await getTranslations({ locale, namespace: 'Bookings' });
  const tr = await getTranslations({ locale, namespace: 'Rewards' });
  const to = await getTranslations({ locale, namespace: 'Offers' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirected anonymous visitors; this is defence in depth.
  if (!user) {
    redirect(localizedPath('/login', locale));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, country, role')
    .eq('id', user.id)
    .single();

  const name = profile?.full_name ?? user.user_metadata?.full_name ?? '';
  const roleKey =
    profile?.role === 'provider'
      ? 'roleProvider'
      : profile?.role === 'admin'
        ? 'roleAdmin'
        : 'roleCustomer';

  // Live stats: rewards balance + booking counts (real data, not placeholders).
  const [points, bookingsRes] = await Promise.all([
    getBalance().catch(() => null),
    supabase.from('bookings').select('id, status').eq('customer_id', user.id),
  ]);
  const bookings = bookingsRes.data ?? [];
  const activeCount = bookings.filter((b: { status: string }) =>
    ['pending', 'confirmed', 'in_progress'].includes(b.status)
  ).length;
  const completedCount = bookings.filter(
    (b: { status: string }) => b.status === 'completed'
  ).length;

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">
        {t('dashboardWelcome', { name: name || user.email })}
      </h1>

      {/* Live stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/app/rewards" className="block">
          <Panel className="text-center !p-4 transition-shadow hover:shadow-md">
            <p className="text-3xl font-bold text-brand-600">{points ?? 0}</p>
            <p className="mt-1 text-xs font-semibold text-brand-700">
              {tr('pointsUnit')}
            </p>
          </Panel>
        </Link>
        <Link href="/app/bookings" className="block">
          <Panel className="text-center !p-4 transition-shadow hover:shadow-md">
            <p className="text-3xl font-bold text-brand-600">{activeCount}</p>
            <p className="mt-1 text-xs font-semibold text-brand-700">
              {t('statActiveBookings')}
            </p>
          </Panel>
        </Link>
        <Link href="/app/bookings" className="block">
          <Panel className="text-center !p-4 transition-shadow hover:shadow-md">
            <p className="text-3xl font-bold text-brand-600">{completedCount}</p>
            <p className="mt-1 text-xs font-semibold text-brand-700">
              {t('statCompletedBookings')}
            </p>
          </Panel>
        </Link>
      </div>

      {/* Offers banner */}
      <Link href="/app/offers" className="block">
        <Panel className="flex items-center justify-between gap-3 !p-4 transition-shadow hover:shadow-md">
          <div>
            <p className="text-base font-bold text-brand-900">🎁 {to('title')}</p>
            <p className="text-sm text-brand-700">{to('subtitle')}</p>
          </div>
          <span aria-hidden="true" className="text-2xl text-brand-400">→</span>
        </Panel>
      </Link>

      <Panel>
        <dl className="space-y-2 text-base">
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-brand-900">{t('profileEmail')}</dt>
            <dd className="text-brand-800">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-brand-900">{t('profileCountry')}</dt>
            <dd className="text-brand-800">
              {countryName(profile?.country ?? '')}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-brand-900">{t('profileRole')}</dt>
            <dd className="text-brand-800">{t(roleKey)}</dd>
          </div>
        </dl>
      </Panel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Panel>
          <h2 className="text-xl font-bold text-brand-900">
            {t('dashboardCta1Title')}
          </h2>
          <p className="mt-2 text-base text-brand-800">{t('dashboardCta1Text')}</p>
          <Link
            href="/app/provider"
            className="mt-4 inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
          >
            {t('dashboardCta1Button')}
          </Link>
        </Panel>
        <Panel>
          <h2 className="text-xl font-bold text-brand-900">
            {t('profileTitle')}
          </h2>
          <p className="mt-2 text-base text-brand-800">{t('dashboardCta2Text')}</p>
          <Link
            href="/app/profile"
            className="mt-4 inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-lg font-semibold text-brand-700 hover:bg-brand-50"
          >
            {t('dashboardCta2Button')}
          </Link>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-brand-900">
              {tb('myBookings')}
            </h2>
            <p className="mt-1 text-base text-brand-800">
              {activeCount > 0
                ? t('activeBookingsHint', { count: activeCount })
                : tb('noBookingsHint')}
            </p>
          </div>
          <Link
            href="/app/bookings"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
          >
            {tb('myBookings')}
          </Link>
        </div>
      </Panel>
    </div>
  );
}
