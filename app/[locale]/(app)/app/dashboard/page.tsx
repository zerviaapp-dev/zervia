import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countryName } from '@/lib/countries';
import { isCategory, type Category } from '@/lib/categories';
import { categoryShowcase } from '@/lib/category-meta';
import {
  currencyForCountry,
  formatListingPrice,
  type Currency,
} from '@/lib/currency';
import { SearchAutocomplete } from '@/components/SearchAutocomplete';
import { AdSlot } from '@/components/AdSlot';
import { BrowseFilters } from '@/components/dashboard/BrowseFilters';

/**
 * V2 public browse MUST render dynamically (Nov 2, 2026 crash fix).
 *
 * Root-cause analysis of the anonymous-dashboard crash (digest 797014909,
 * Vercel-preview-only): the Vercel build marked this route ● (SSG,
 * statically prerendered per-locale via generateStaticParams), but the
 * page is inherently dynamic — it awaits searchParams, reads cookies via
 * createClient(), and queries live listings. The static prerender path
 * combined with the useSearchParams() client island (BrowseFilters, no
 * Suspense boundary) is the prime suspect for the preview-only server
 * crash. force-dynamic removes the prerender from the equation entirely:
 * every request renders fresh, which is also what a live marketplace
 * dashboard wants (no stale rails).
 */
export const dynamic = 'force-dynamic';

/**
 * Dashboard 2.0 (Liz, Nov 1 2026) — PUBLIC browse home (V2: Kijiji pattern).
 *
 * No sign-in required to see what's inside: anonymous visitors get the
 * same rails (services + items nearby, unfiltered by country). Signup is
 * required at the transaction point — "My listings" tab, "Post a listing",
 * location/profile, and the seller management panel are session-gated
 * (middleware redirects anonymous to /login with a return URL).
 *
 * Layout: tab strip (Browse / My listings) → hero ("Find goods. Connect
 * with local services." + Shop items | Find services mode toggle) →
 * search + location + Post a listing → ad slot → service category chips →
 * Local services rail (real active listings → View service → Contact
 * provider on the listing page) → ad slot → Items nearby rail →
 * "Your listings & services" management panel (signed-in sellers only).
 *
 * Honesty rules baked in:
 * - Chips map 1:1 onto postable taxonomy (launch scope: HIDDEN_CATEGORIES
 *   in lib/goods-rails.ts are never offered as browse filters).
 * - Cards render ONLY real active listings from the DB. Zero supply =
 *   honest empty state, never illustrative filler.
 * - No booking, payment, or verification claims anywhere. The services
 *   rail carries the plain no-verification statement (P0/D3 rule).
 * - Saved/Messages tabs are NOT shipped (no backend exists) — recorded
 *   as justified-open carry-forward, not dead links.
 */

/**
 * Postable service categories for the 2.0 browse (launch scope).
 * Source of truth for posting is HIDDEN_CATEGORIES in lib/goods-rails.ts;
 * this is its browse-side mirror: every taxonomy category minus the
 * hidden-at-posting set minus buy_sell (goods live in the items rail).
 * Keep in sync if the launch scope changes.
 */
const SERVICE_CATEGORIES = [
  'cleaning',
  'handyman',
  'tutoring',
  'beauty',
  'fitness',
  'cooking',
  'tech',
  'moving',
  'yard',
  'errands',
  'other',
  'window_glass_cleaning',
] as const;

type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

function isServiceCategory(value: string): value is ServiceCategory {
  return (SERVICE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Illustrative chips → approved taxonomy mapping (Liz: "map the existing
 * approved services into this layout"). Each chip filters the services
 * rail to its category set; all sets are postable launch-scope categories.
 */
const SERVICE_CHIPS: {
  key: string;
  labelKey: string;
  icon: string;
  categories: readonly ServiceCategory[];
}[] = [
  {
    key: 'home_help',
    labelKey: 'chipHomeHelp',
    icon: '🏠',
    categories: [
      'cleaning',
      'handyman',
      'moving',
      'window_glass_cleaning',
      'yard',
    ],
  },
  { key: 'repairs', labelKey: 'chipRepairs', icon: '🔧', categories: ['handyman'] },
  { key: 'cleaning', labelKey: 'chipCleaning', icon: '🧹', categories: ['cleaning'] },
  { key: 'lessons', labelKey: 'chipLessons', icon: '📚', categories: ['tutoring'] },
];

type RailListing = {
  id: string;
  title: string;
  category: string;
  price_cents: number | null;
  price_type: string;
  country: string;
  city: string | null;
  created_at: string;
  providers: { id: string; business_name: string | null; city: string | null } | null;
};

/** Minimal select — columns guaranteed by the core migrations. */
const RAIL_SELECT =
  'id, title, category, price_cents, price_type, country, city, created_at, providers!inner(id, business_name, city)';

async function fetchRail(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  opts: {
    categories: readonly string[];
    country: string;
    oldestFirst: boolean;
    limit: number;
  }
): Promise<RailListing[]> {
  try {
    let q = supabase
      .from('listings')
      .select(RAIL_SELECT)
      .eq('status', 'active')
      .in('category', [...opts.categories])
      .order('created_at', { ascending: opts.oldestFirst })
      .limit(opts.limit);
    if (opts.country) q = q.eq('country', opts.country);
    // Cast the whole result (same pattern as discover): postgrest-js types
    // the !inner join as an array; the query guarantees one provider row.
    const { data, error } = (await q) as {
      data: RailListing[] | null;
      error: { message?: string } | null;
    };
    if (error) {
      console.error('[dashboard-2.0] rail query failed:', error.message);
      return [];
    }
    return (data ?? []) as RailListing[];
  } catch (e) {
    console.error('[dashboard-2.0] rail query threw:', e);
    return [];
  }
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'DashboardV2' });
  const tc = await getTranslations({ locale, namespace: 'Categories' });
  const td = await getTranslations({ locale, namespace: 'Discover' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  // V2 public browse: auth must NEVER crash the page. A throwing getUser
  // (flaky token, edge cookie state) degrades to anonymous, not a 500 —
  // "no signup to see what's inside" is the whole point.
  let user: { id: string } | null = null;
  try {
    user = (await supabase.auth.getUser()).data.user as {
      id: string;
    } | null;
  } catch {
    user = null;
  }

  // V2 public browse: anonymous visitors see the same rails. Seller-only
  // queries are skipped (null) — the management panel below is hidden.
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('full_name, country')
        .eq('id', user.id)
        .single()
    : { data: null };
  const userCountry: string = profile?.country ?? '';
  const placeLabel = userCountry ? countryName(userCountry) : '';

  const adLabel = td('advertisementLabel');
  const notVerifiedNote = td('notVerifiedNote');
  const dashboardPath = localizedPath('/app/dashboard', locale);
  const discoverPath = localizedPath('/discover', locale);

  // --- Mode: services (default) | goods. Controls rail order + toggle style.
  const mode = sp.mode === 'goods' ? 'goods' : 'services';

  // --- Effective service filter: explicit category > chip preset > all.
  const chipKey = typeof sp.chip === 'string' ? sp.chip : '';
  const activeChip = SERVICE_CHIPS.find((c) => c.key === chipKey) ?? null;
  const catParam = typeof sp.category === 'string' ? sp.category : '';
  const activeCategory: ServiceCategory | null =
    catParam && isServiceCategory(catParam) ? catParam : null;
  const effectiveServiceCats: readonly string[] = activeCategory
    ? [activeCategory]
    : activeChip
      ? activeChip.categories
      : SERVICE_CATEGORIES;
  const oldestFirst = sp.sort === 'oldest';

  // --- Rails (real data only).
  const [services, items] = await Promise.all([
    fetchRail(supabase, {
      categories: effectiveServiceCats,
      country: userCountry,
      oldestFirst,
      limit: 8,
    }),
    fetchRail(supabase, {
      categories: ['buy_sell'],
      country: userCountry,
      oldestFirst: false,
      limit: 6,
    }),
  ]);

  // --- "Your listings & services" management panel (signed-in seller only).
  const { data: providerRow } = user
    ? await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
    : { data: null };
  let manageCounts: { items: number; services: number; drafts: number } | null =
    null;
  if (providerRow) {
    const { data: mine } = (await supabase
      .from('listings')
      .select('id, category, status')
      .eq('provider_id', (providerRow as { id: string }).id)
      .neq('status', 'removed')) as {
      data: { id: string; category: string; status: string }[] | null;
    };
    const rows = mine ?? [];
    manageCounts = {
      items: rows.filter(
        (r) => r.category === 'buy_sell' && r.status === 'active'
      ).length,
      services: rows.filter(
        (r) =>
          r.category !== 'buy_sell' &&
          isCategory(r.category) &&
          r.status === 'active'
      ).length,
      drafts: rows.filter((r) => r.status === 'draft').length,
    };
  }

  const viewerCurrency: Currency = currencyForCountry(userCountry || 'CA');

  const relDate = (iso: string) => {
    const days = Math.floor((Date.now() - +new Date(iso)) / 86400000);
    if (days <= 0) return t('today');
    if (days === 1) return t('yesterday');
    return t('daysAgo', { count: days });
  };

  const priceLabel = (l: RailListing) =>
    formatListingPrice(
      l.price_cents,
      l.price_type,
      currencyForCountry(l.country || 'CA'),
      viewerCurrency,
      {
        quote: t('contactForPricing'),
        hourlySuffix: '/h',
        fixedSuffix: '',
      },
      locale
    );

  const listingHref = (id: string) => localizedPath(`/listings/${id}`, locale);

  const renderServiceCard = (l: RailListing) => (
    <li key={l.id} className="overflow-hidden rounded-2xl bg-white shadow sm:rounded-3xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={categoryShowcase[l.category as Category]?.photo ?? '/images/categories/other.jpg'}
        alt=""
        loading="lazy"
        className="h-28 w-full bg-brand-100 object-cover sm:h-32"
      />
      <div className="p-3 sm:p-4">
        <h3 className="truncate text-base font-bold text-brand-900" title={l.title}>{l.title}</h3>
        <p className="mt-1 truncate text-sm text-brand-700">
          {[
            l.providers?.business_name,
            l.city ?? countryName(l.country),
            relDate(l.created_at),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-brand-800">
          {priceLabel(l)}
        </p>
        <Link
          href={listingHref(l.id)}
          aria-label={`${t('viewService')}: ${l.title}`}
          className="mt-2 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700 sm:mt-3"
        >
          {t('viewService')}
        </Link>
      </div>
    </li>
  );

  const renderItemCard = (l: RailListing) => (
    <li key={l.id} className="overflow-hidden rounded-2xl bg-white shadow sm:rounded-3xl">
      <Link href={listingHref(l.id)} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={categoryShowcase.buy_sell.photo}
          alt=""
          loading="lazy"
          className="h-24 w-full bg-brand-100 object-cover sm:h-28"
        />
        <div className="p-3 sm:p-4">
          <h3 className="truncate text-base font-bold text-brand-900" title={l.title}>{l.title}</h3>
          <p className="mt-1 truncate text-base font-bold text-brand-800">{priceLabel(l)}</p>
          <p className="mt-1 truncate text-sm text-brand-700">
            {l.city ?? countryName(l.country)} · {relDate(l.created_at)}
          </p>
        </div>
      </Link>
    </li>
  );

  const servicesSection = (
    <section aria-label={t('findServices')}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
            {placeLabel
              ? t('servicesNear', { place: placeLabel })
              : t('findServices')}
          </h2>
          <p className="mt-1 hidden text-sm text-brand-700 sm:block">{t('servicesHint')}</p>
          {/* P0/D3: plain no-verification statement on the services surface.
              Always visible — honesty rule, never hidden for density. */}
          <p className="mt-1 text-xs text-brand-500">{notVerifiedNote}</p>
        </div>
        {/* Suspense boundary (Nov 2, 2026 crash fix): BrowseFilters uses
            useSearchParams(), which Next.js requires to be wrapped in
            Suspense. Without it, the static prerender path can crash the
            server render (prime suspect for digest 797014909). */}
        <Suspense
          fallback={
            <div
              className="inline-flex min-h-[44px] items-center rounded-full border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-800"
              aria-hidden="true"
            />
          }
        >
          <BrowseFilters
            dashboardPath={dashboardPath}
            categoryLabel={t('categoryFilter')}
            allCategoriesLabel={t('allCategories')}
            sortLabel={t('sortLabel')}
            sortNewestLabel={t('sortNewest')}
            sortOldestLabel={t('sortOldest')}
            categories={SERVICE_CATEGORIES}
            categoryName={(c) => tc(c as 'cleaning')}
          />
        </Suspense>
      </div>
      {placeLabel ? (
        <p className="mt-2 text-xs font-semibold text-brand-500">
          {t('nearScope', { place: placeLabel })}
        </p>
      ) : null}
      {services.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {services.map(renderServiceCard)}
        </ul>
      ) : (
        <Panel className="mt-4 !p-4 text-center sm:!p-6">
          <p className="text-base font-bold text-brand-900">{t('noServices')}</p>
          <p className="mt-1 text-sm text-brand-700">{t('noServicesHint')}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href={discoverPath}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
            >
              {t('browseDiscover')}
            </Link>
            <Link
              href={localizedPath('/app/become-provider', locale)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-6 font-semibold text-brand-700 hover:bg-brand-50"
            >
              {t('startSellingButton')}
            </Link>
          </div>
        </Panel>
      )}
    </section>
  );

  const itemsSection = (
    <section aria-label={t('itemsNearby')}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">{t('itemsNearby')}</h2>
        <Link
          href={`${discoverPath}?category=buy_sell`}
          className="inline-flex min-h-[44px] shrink-0 items-center text-sm font-semibold text-brand-700 underline hover:text-brand-900"
        >
          {t('seeAllItems')} →
        </Link>
      </div>
      {items.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {items.map(renderItemCard)}
        </ul>
      ) : (
        <Panel className="mt-4 !p-4 text-center sm:!p-6">
          <p className="text-base font-bold text-brand-900">{t('noItems')}</p>
          <p className="mt-1 text-sm text-brand-700">{t('noServicesHint')}</p>
        </Panel>
      )}
    </section>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tab strip: Browse (active) / My listings. Saved + Messages are not
          shipped — no backend exists; dead tabs would be dishonest UI.
          Recorded as justified-open carry-forward. */}
      <nav
        aria-label={t('browseTab')}
        className="flex gap-6 border-b border-brand-100"
      >
        <span
          aria-current="page"
          className="border-b-2 border-brand-600 px-1 pb-2 text-base font-bold text-brand-800"
        >
          {t('browseTab')}
        </span>
        <Link
          href={localizedPath('/app/provider', locale)}
          className="px-1 pb-2 text-base font-semibold text-brand-500 hover:text-brand-800"
        >
          {t('myListingsTab')}
        </Link>
      </nav>

      {/* Hero: title + Shop items | Find services mode toggle.
          Compact on mobile (first listings above the fold at 360x740);
          roomier on sm+ where scrolling is cheaper. */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-4 py-5 text-center text-white sm:rounded-3xl sm:px-6 sm:py-8">
        <h1 className="text-xl font-bold sm:text-3xl">{t('heroTitle')}</h1>
        <div
          role="group"
          aria-label={t('heroTitle')}
          className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-2 rounded-full bg-white/15 p-1.5 sm:mt-5"
        >
          <Link
            href={`${dashboardPath}?mode=goods`}
            aria-pressed={mode === 'goods'}
            className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-4 font-semibold transition-colors ${
              mode === 'goods'
                ? 'bg-white text-brand-700 shadow'
                : 'text-white hover:bg-white/10'
            }`}
          >
            <span aria-hidden="true">🛒</span> {t('shopItems')}
          </Link>
          <Link
            href={`${dashboardPath}?mode=services`}
            aria-pressed={mode === 'services'}
            className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-4 font-semibold transition-colors ${
              mode === 'services'
                ? 'bg-white text-brand-700 shadow'
                : 'text-white hover:bg-white/10'
            }`}
          >
            <span aria-hidden="true">🔧</span> {t('findServices')}
          </Link>
        </div>
      </section>

      {/* Search + location + Post a listing. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <SearchAutocomplete
              idPrefix="dashboard2"
              placeholder={t('searchPlaceholder')}
              searchButtonLabel="🔍"
              inputClassName="min-h-[52px] w-full rounded-full border-2 border-brand-200 bg-white px-6 text-base text-brand-900 placeholder:text-brand-400 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={localizedPath('/app/profile', locale)}
              aria-label={t('locationAria')}
              className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-800 hover:border-brand-400"
            >
              <span aria-hidden="true">📍</span>
              {placeLabel || '—'}
            </Link>
            <Link
              href={localizedPath('/app/provider/listings/new', locale)}
              className="inline-flex min-h-[48px] items-center justify-center gap-1 rounded-full bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700"
            >
              <span aria-hidden="true">＋</span> {t('postListing')}
            </Link>
          </div>
        </div>
      </div>

      {/* Advertisement placeholder — banner below search (Liz, Oct 29 2026:
          ads accepted as revenue). Labelled, inert, visually distinct. */}
      <AdSlot label={adLabel} slot="dashboard-top" format="banner" />

      {/* Service category chips → filter the services rail. */}
      <section aria-label={t('categoryFilter')}>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {SERVICE_CHIPS.map((chip) => {
            const active = activeChip?.key === chip.key && !activeCategory;
            // Chip links reset the manual category/sort filters — chip and
            // dropdown are two views of the same filter, never stacked.
            const chipHref = active
              ? `${dashboardPath}?mode=${mode}`
              : `${dashboardPath}?mode=${mode}&chip=${chip.key}`;
            return (
              <Link
                key={chip.key}
                href={chipHref}
                aria-pressed={active}
                className={`inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors sm:px-5 ${
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-brand-200 bg-white text-brand-800 hover:border-brand-400'
                }`}
              >
                <span aria-hidden="true">{chip.icon}</span>
                {t(chip.labelKey)}
              </Link>
            );
          })}
          <Link
            href={discoverPath}
            className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-full border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-800 hover:border-brand-400 sm:px-5"
          >
            <span aria-hidden="true">⋯</span> {t('chipMore')}
          </Link>
        </div>
      </section>

      {mode === 'services' ? (
        <>
          {servicesSection}
          <AdSlot label={adLabel} slot="dashboard-mid" format="banner" />
          {itemsSection}
        </>
      ) : (
        <>
          {itemsSection}
          <AdSlot label={adLabel} slot="dashboard-mid" format="banner" />
          {servicesSection}
        </>
      )}

      {/* "Your listings & services" — seller management panel, signed-in
          only (hidden for anonymous public-browse visitors). Lives in the
          signed-in dashboard; management itself happens at /app/provider
          ("My listings"): sellers manage both items and services there. */}
      {user ? (
      <section aria-label={t('manageTitle')}>
        <Panel className="!p-4 sm:!p-5">
          <h2 className="text-lg font-bold text-brand-900 sm:text-xl">{t('manageTitle')}</h2>
          {manageCounts ? (
            <div className="mt-4">
              <dl className="grid grid-cols-3 gap-3 text-center">
                <div className="flex flex-col rounded-2xl bg-brand-50 px-2 py-4">
                  <dt className="order-2 mt-1 block text-xs font-semibold text-brand-700">
                    <span aria-hidden="true" className="mr-1 text-base">🛒</span>
                    {t('manageItems')}
                  </dt>
                  <dd className="order-1 text-2xl font-bold text-brand-800">
                    {manageCounts.items}
                  </dd>
                </div>
                <div className="flex flex-col rounded-2xl bg-brand-50 px-2 py-4">
                  <dt className="order-2 mt-1 block text-xs font-semibold text-brand-700">
                    <span aria-hidden="true" className="mr-1 text-base">🔧</span>
                    {t('manageServices')}
                  </dt>
                  <dd className="order-1 text-2xl font-bold text-brand-800">
                    {manageCounts.services}
                  </dd>
                </div>
                <div className="flex flex-col rounded-2xl bg-brand-50 px-2 py-4">
                  <dt className="order-2 mt-1 block text-xs font-semibold text-brand-700">
                    <span aria-hidden="true" className="mr-1 text-base">📄</span>
                    {t('manageDrafts')}
                  </dt>
                  <dd className="order-1 text-2xl font-bold text-brand-800">
                    {manageCounts.drafts}
                  </dd>
                </div>
              </dl>
              <Link
                href={localizedPath('/app/provider', locale)}
                className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 font-semibold text-brand-700 hover:bg-brand-50"
              >
                {t('manageButton')}
              </Link>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-base font-bold text-brand-900">
                {t('startSellingTitle')}
              </p>
              <p className="mt-1 text-sm text-brand-700">{t('startSellingText')}</p>
              <Link
                href={localizedPath('/app/provider/onboarding', locale)}
                className="mt-4 inline-flex min-h-[52px] items-center justify-center rounded-full bg-brand-600 px-8 font-semibold text-white hover:bg-brand-700"
              >
                {t('startSellingButton')}
              </Link>
            </div>
          )}
        </Panel>
      </section>
      ) : null}
    </div>
  );
}
