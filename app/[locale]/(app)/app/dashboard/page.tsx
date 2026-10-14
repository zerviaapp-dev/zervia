import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countryName } from '@/lib/countries';
import { getBalance, getLedger } from '@/lib/supabase/rewards-actions';
import { categories, type Category } from '@/lib/categories';
import { categoryShowcase } from '@/lib/category-meta';
import {
  SIGNUP_BONUS_POINTS,
  REFERRAL_BONUS_POINTS,
  BOOKING_BONUS_POINTS,
  REVIEW_BONUS_POINTS,
} from '@/lib/rewards';
import { currencyForCountry, formatCurrency, type Currency } from '@/lib/currency';

/** Emoji icons for the 29 marketplace categories (dashboard shortcuts). */
const categoryIcons: Record<Category, string> = {
  cleaning: '🧹',
  handyman: '🔧',
  plumbing: '🚿',
  electrical: '⚡',
  tutoring: '📚',
  caregiving: '🤝',
  beauty: '💅',
  massage: '💆',
  fitness: '💪',
  cooking: '🍳',
  tech: '💻',
  moving: '📦',
  yard: '🌱',
  errands: '🛒',
  other: '✨',
  drafting: '📐',
  home_renovation: '🏗️',
  basement_renovation: '🏠',
  cabinetry: '🗄️',
  bathroom_renovation: '🛁',
  window_glass_cleaning: '🪟',
  led_lighting: '💡',
  solar_install: '☀️',
  sealants: '🔨',
  buy_sell: '🏷️',
  room_rentals: '🛏️',
  house_rent: '🏡',
  basement_suite: '🚪',
  apartment_condo: '🏢',
  locksmith: '🔐',
  flower_shop: '💐',
  content_creator: '🎬',
  web_developer: '🌐',
  app_developer: '📱',
};

type ActivityItem = {
  id: string;
  date: string;
  icon: string;
  text: string;
  sub?: string;
  points?: number;
};

const LEDGER_REASON_ICONS: Record<string, string> = {
  signup: '🎉',
  referral_given: '💌',
  referral_received: '💌',
  booking: '📅',
  review: '⭐',
  offer: '🎁',
  redemption: '🚀',
  adjustment: '🔧',
};

const LEDGER_REASON_KEYS: Record<string, string> = {
  signup: 'reasonSignup',
  referral_given: 'reasonReferralGiven',
  referral_received: 'reasonReferralReceived',
  booking: 'reasonBooking',
  review: 'reasonReview',
  offer: 'reasonOffer',
  redemption: 'reasonRedemption',
  adjustment: 'reasonAdjustment',
};

/**
 * Customer home screen: search, categories, live stats, activity, nudges.
 * Provider accounts also see a business-at-a-glance strip.
 */
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
  const tc = await getTranslations({ locale, namespace: 'Categories' });
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
  const userCountry: string = profile?.country ?? '';
  const isProvider = profile?.role === 'provider';
  const roleKey = isProvider
    ? 'roleProvider'
    : profile?.role === 'admin'
      ? 'roleAdmin'
      : 'roleCustomer';

  // Live stats: rewards balance + booking counts (real data, not placeholders).
  const [points, bookingsRes, ledgerRows] = await Promise.all([
    getBalance().catch(() => null),
    supabase.from('bookings').select('id, status').eq('customer_id', user.id),
    getLedger(5).catch(() => []),
  ]);
  const bookings = bookingsRes.data ?? [];
  const activeCount = bookings.filter((b: { status: string }) =>
    ['pending', 'confirmed', 'in_progress'].includes(b.status)
  ).length;
  const completedCount = bookings.filter(
    (b: { status: string }) => b.status === 'completed'
  ).length;

  // Recent customer bookings (for the activity feed).
  const { data: recentBookings } = await supabase
    .from('bookings')
    .select('id, status, created_at, listings(title)')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(3);

  // Build the activity feed: ledger rows + recent bookings, newest first.
  const activity: ActivityItem[] = [
    ...ledgerRows.map((r) => ({
      id: `ledger-${r.id}`,
      date: r.created_at,
      icon: LEDGER_REASON_ICONS[r.reason] ?? '✨',
      text:
        (LEDGER_REASON_KEYS[r.reason]
          ? tr(LEDGER_REASON_KEYS[r.reason])
          : r.reason) ?? r.reason,
      points: r.points_delta,
    })),
    ...((recentBookings ?? []).map((b: {
      id: string;
      status: string;
      created_at: string;
      listings: { title: string } | { title: string }[] | null;
    }) => {
      const listing = Array.isArray(b.listings) ? b.listings[0] : b.listings;
      return {
        id: `booking-${b.id}`,
        date: b.created_at,
        icon: '📅',
        text: listing?.title ?? tb('myBookings'),
        sub: b.status.replace(/_/g, ' '),
      };
    }) as ActivityItem[]),
  ]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 5);

  // Popular categories near the user: count active listings per category.
  let popularCategories: { category: Category; count: number }[] = [];
  if (userCountry) {
    const { data: countryListings } = await supabase
      .from('listings')
      .select('category')
      .eq('country', userCountry)
      .eq('status', 'active')
      .limit(200);
    const counts = new Map<string, number>();
    for (const row of countryListings ?? []) {
      const cat = (row as { category: string }).category;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    popularCategories = [...counts.entries()]
      .filter(([cat]) =>
        (categories as readonly string[]).includes(cat)
      )
      .map(([category, count]) => ({ category: category as Category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  // Provider business strip: this week's earnings + pending requests.
  let providerStats: {
    weekEarningsCents: number;
    pendingRequests: number;
    completedJobs: number | null;
    currency: Currency;
  } | null = null;
  if (isProvider) {
    const { data: providerRow } = await supabase
      .from('providers')
      .select('id, completed_jobs, country')
      .eq('user_id', user.id)
      .maybeSingle();
    if (providerRow) {
      const { data: provBookings } = await supabase
        .from('bookings')
        .select('status, agreed_price_cents, created_at')
        .eq('provider_id', (providerRow as { id: string }).id);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const rows = (provBookings ?? []) as {
        status: string;
        agreed_price_cents: number | null;
        created_at: string;
      }[];
      const weekEarningsCents = rows
        .filter(
          (b) =>
            b.status === 'completed' && +new Date(b.created_at) >= weekAgo
        )
        .reduce((sum, b) => sum + (b.agreed_price_cents ?? 0), 0);
      const pendingRequests = rows.filter(
        (b) => b.status === 'pending'
      ).length;
      providerStats = {
        weekEarningsCents,
        pendingRequests,
        completedJobs: (providerRow as { completed_jobs: number | null })
          .completed_jobs,
        currency: currencyForCountry(
          (providerRow as { country: string }).country ?? 'CA'
        ),
      };
    }
  }

  // Nudge: has the user loaded any merchant offer yet?
  // (offers tables arrive with migration 0025 — tolerate their absence.)
  let hasLoadedOffer = false;
  try {
    const { count } = await supabase
      .from('offer_activations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    hasLoadedOffer = (count ?? 0) > 0;
  } catch {
    hasLoadedOffer = false;
  }

  const profileIncomplete = !profile?.full_name;
  const discoverPath = localizedPath('/discover', locale);

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">
        {t('dashboardWelcome', { name: name || user.email })}
      </h1>

      {/* 1 — Prominent service search */}
      <form action={discoverPath} method="get" role="search">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="min-h-[56px] w-full rounded-full border-2 border-brand-200 bg-white px-6 text-lg text-brand-900 placeholder:text-brand-400 focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex min-h-[56px] shrink-0 items-center justify-center rounded-full bg-brand-600 px-6 text-lg font-semibold text-white hover:bg-brand-700"
          >
            🔍
          </button>
        </div>
      </form>

      {/* 2 — Category shortcuts (photo cards) */}
      <section aria-label={t('browseCategories')}>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {categories.map((cat) => (
            <Link
              key={cat}
              href={`${discoverPath}?category=${cat}`}
              className="group relative block h-24 w-36 shrink-0 overflow-hidden rounded-2xl shadow-[0_2px_16px_rgba(11,91,211,0.12)] transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={categoryShowcase[cat].photo}
                alt={tc(cat)}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                aria-hidden="true"
              />
              <span className="absolute inset-x-0 bottom-0 px-2 pb-1.5 text-center text-xs font-bold text-white">
                {tc(cat)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Live stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/app/rewards" className="block">
          <Panel className="text-center !p-4 transition-shadow hover:shadow-md">
            <p className="text-3xl font-bold text-brand-600">{points ?? 0}</p>
            <p className="mt-1 text-xs font-semibold text-brand-700">
              {tr('pointsUnit')}
            </p>
            <p className="mt-1 text-[11px] text-brand-500">{t('pointsValue')}</p>
            <p className="mt-1 text-[11px] font-semibold text-brand-600 underline">
              {t('howToEarn')}
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

      {/* 6 — Provider business strip */}
      {providerStats && (
        <Panel className="!p-4">
          <h2 className="text-base font-bold text-brand-900">
            📊 {t('providerWeekTitle')}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-brand-600">
                {formatCurrency(
                  providerStats.weekEarningsCents,
                  providerStats.currency,
                  locale
                )}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-brand-700">
                {t('providerEarningsWeek')}
              </p>
            </div>
            <Link href="/app/provider/bookings" className="block">
              <p className="text-xl font-bold text-brand-600">
                {providerStats.pendingRequests}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-brand-700 underline">
                {t('providerPending')}
              </p>
            </Link>
            <div>
              <p className="text-xl font-bold text-brand-600">
                {providerStats.completedJobs ?? 0}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-brand-700">
                {t('providerJobsDone')}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/app/provider"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-6 font-semibold text-brand-700 hover:bg-brand-50"
            >
              {t('viewProviderDash')}
            </Link>
            <Link
              href="/app/provider/listings/new"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
            >
              ➕ {t('createListing')}
            </Link>
          </div>
        </Panel>
      )}

      {/* 6b — Provider onboarding nudge: signed up as provider but no profile yet */}
      {isProvider && !providerStats && (
        <Panel className="!p-4 !border-brand-300 !bg-brand-50">
          <p className="text-base font-bold text-brand-900">
            🚀 {t('providerSetupTitle')}
          </p>
          <p className="mt-1 text-sm text-brand-700">
            {t('providerSetupText')}
          </p>
          <Link
            href="/app/provider/onboarding"
            className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
          >
            {t('providerSetupButton')}
          </Link>
        </Panel>
      )}

      {/* 7 — Progress nudges */}
      {(profileIncomplete || !hasLoadedOffer) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {profileIncomplete && (
            <Panel className="!p-4">
              <p className="text-base font-bold text-brand-900">
                👤 {t('nudgeProfileTitle')}
              </p>
              <p className="mt-1 text-sm text-brand-700">
                {t('nudgeProfileText')}
              </p>
              <Link
                href="/app/profile"
                className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
              >
                {t('nudgeProfileButton')}
              </Link>
            </Panel>
          )}
          {!hasLoadedOffer && (
            <Panel className="!p-4">
              <p className="text-base font-bold text-brand-900">
                🎁 {t('nudgeOfferTitle')}
              </p>
              <p className="mt-1 text-sm text-brand-700">
                {t('nudgeOfferText')}
              </p>
              <Link
                href="/app/offers"
                className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
              >
                {t('nudgeOfferButton')}
              </Link>
            </Panel>
          )}
        </div>
      )}

      {/* 5 — Popular near you */}
      <Panel className="!p-4">
        <h2 className="text-base font-bold text-brand-900">
          📍 {t('popularNearYou')}
        </h2>
        {popularCategories.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {popularCategories.map(({ category, count }) => (
              <Link
                key={category}
                href={`${discoverPath}?category=${category}`}
                className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100"
              >
                <span aria-hidden="true">{categoryIcons[category]}</span>
                {tc(category)}
                <span className="text-xs font-normal text-brand-500">
                  · {count}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-brand-700">
            {t('noPopularCountry', {
              country: countryName(userCountry),
            })}
          </p>
        )}
      </Panel>

      {/* 4 — Recent activity */}
      <Panel className="!p-4">
        <h2 className="text-base font-bold text-brand-900">
          🕘 {t('recentActivity')}
        </h2>
        {activity.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {activity.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl"
                >
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-900">
                    {item.text}
                  </p>
                  {item.sub && (
                    <p className="text-xs capitalize text-brand-500">
                      {item.sub}
                    </p>
                  )}
                </div>
                {typeof item.points === 'number' && (
                  <span
                    className={`shrink-0 text-sm font-bold ${item.points >= 0 ? 'text-green-600' : 'text-red-500'}`}
                  >
                    {item.points >= 0 ? '+' : ''}
                    {item.points}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-brand-700">{t('noActivity')}</p>
        )}
      </Panel>

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

      {/* How to earn mini-strip (points explainer detail) */}
      <Panel className="!p-4">
        <h2 className="text-base font-bold text-brand-900">
          ✨ {t('howToEarn')} · {t('pointsValue')}
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <li className="rounded-2xl bg-brand-50 px-3 py-2 text-brand-800">
            🎉 {tr('earnSignup')} · <b>+{SIGNUP_BONUS_POINTS}</b>
          </li>
          <li className="rounded-2xl bg-brand-50 px-3 py-2 text-brand-800">
            💌 {tr('earnReferral')} · <b>+{REFERRAL_BONUS_POINTS}</b>
          </li>
          <li className="rounded-2xl bg-brand-50 px-3 py-2 text-brand-800">
            📅 {tr('earnBooking')} · <b>+{BOOKING_BONUS_POINTS}</b>
          </li>
          <li className="rounded-2xl bg-brand-50 px-3 py-2 text-brand-800">
            ⭐ {tr('earnReview')} · <b>+{REVIEW_BONUS_POINTS}</b>
          </li>
        </ul>
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
