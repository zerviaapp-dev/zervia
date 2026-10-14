import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { TrustBadge, type TrustLevel } from '@/components/TrustBadge';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { DiscoverResults } from '@/components/maps/DiscoverResults';
import type { MapListing } from '@/components/maps/NearMeMap';
import { AuditedBadge } from '@/components/provider/AuditedBadge';
import { VerificationBadges } from '@/components/provider/VerificationBadges';
import { getProviderBadges, type BadgeKey } from '@/lib/provider-badges';
import { SafetyBanner } from '@/components/SafetyBanner';
import { isGuaranteeCategory } from '@/lib/guarantee';
import { createClient } from '@/lib/supabase/server';
import { categoryGroups, subcategories, isCategory, isSubcategory, type Subcategory } from '@/lib/categories';
import { countryName } from '@/lib/countries';
import { currencyForCountry, formatListingPrice } from '@/lib/currency';
import { getActiveProducts } from '@/lib/supabase/product-actions';
import { localizedPath } from '@/lib/locale-path';

type DiscoverListing = {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  price_cents: number | null;
  price_type: string;
  country: string;
  city: string | null;
  // Requires migration 0032_listing_coordinates; absent until it is applied.
  latitude?: number | null;
  longitude?: number | null;
  is_featured: boolean;
  featured_priority: number;
  providers: {
    id: string;
    business_name: string;
    verified: boolean;
    // NOTE: requires migration 0027; null-safe until applied.
    verification_badge: boolean | null;
    trust_level: TrustLevel;
    rating_avg: number | null;
    review_count: number | null;
    completed_jobs: number | null;
    city: string | null;
    country: string;
    // NOTE: requires migration 0035; null-safe until applied.
    audited_until: string | null;
    next_available_date: string | null;
    // Badge columns (null-safe until migrations applied).
    id_verified?: boolean | null;
    background_check_passed?: boolean | null;
    pro_verified?: boolean | null;
    created_at?: string | null;
  } | null;
};

type Urgency = 'today' | 'week' | 'flexible';

function isUrgency(v: string): v is Urgency {
  return v === 'today' || v === 'week' || v === 'flexible';
}

function withParams(
  base: string,
  q: string,
  category: string,
  subcategory: string,
  scope: string,
  urgency: string,
  minPrice = '',
  maxPrice = '',
  sort = 'relevance',
): string {
  const params = new URLSearchParams();
  if (scope !== 'worldwide') params.set('scope', scope);
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (subcategory) params.set('subcategory', subcategory);
  if (urgency !== 'flexible') params.set('urgency', urgency);
  if (minPrice) params.set('minPrice', minPrice);
  if (maxPrice) params.set('maxPrice', maxPrice);
  if (sort && sort !== 'relevance') params.set('sort', sort);
  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ''}`;
}

function scopeHref(scope: string, q: string, category: string, subcategory: string, urgency: string, minPrice = '', maxPrice = '', sort = 'relevance'): string {
  const params = new URLSearchParams();
  params.set('scope', scope);
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (subcategory) params.set('subcategory', subcategory);
  if (urgency !== 'flexible') params.set('urgency', urgency);
  if (minPrice) params.set('minPrice', minPrice);
  if (maxPrice) params.set('maxPrice', maxPrice);
  if (sort && sort !== 'relevance') params.set('sort', sort);
  return `/discover?${params.toString()}`;
}

/**
 * Public Discover: the marketplace storefront.
 *
 * Phase 4 — local-first ranking (in-region → completed jobs → rating),
 * problem-based search via search_synonyms ("leaky faucet" → plumbing),
 * and an urgency filter (Today / This week / Flexible) powered by provider
 * availability. "Near me" filters by the signed-in user's profile country
 * (no geolocation needed); brand rule: country/region only in public UI.
 */
export default async function DiscoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    subcategory?: string;
    scope?: string;
    urgency?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
  }>;
}) {
  const { locale } = await params;
  const {
    q = '',
    category = '',
    subcategory = '',
    scope = 'worldwide',
    urgency: urgencyRaw = 'flexible',
    minPrice: minPriceRaw = '',
    maxPrice: maxPriceRaw = '',
    sort: sortRaw = 'relevance',
  } = await searchParams;
  const urgency: Urgency = isUrgency(urgencyRaw) ? urgencyRaw : 'flexible';

  // --- Sort option (user-controlled) ---
  const SORT_OPTIONS = [
    'relevance',
    'price_asc',
    'price_desc',
    'rating',
    'reviews',
  ] as const;
  type SortOption = (typeof SORT_OPTIONS)[number];
  const sort: SortOption = (SORT_OPTIONS as readonly string[]).includes(sortRaw)
    ? (sortRaw as SortOption)
    : 'relevance';

  // --- Price range filter (URL params are dollars; converted to cents for
  // the price_cents column). Invalid values are ignored; min > max swaps.
  function parsePriceDollars(raw: string): number | null {
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }
  let minCents = parsePriceDollars(minPriceRaw);
  let maxCents = parsePriceDollars(maxPriceRaw);
  if (minCents !== null && maxCents !== null && minCents > maxCents) {
    [minCents, maxCents] = [maxCents, minCents];
  }
  // Echo back dollars for the input values (preserve what the user typed).
  const minPriceEcho = minCents !== null ? String(minCents / 100) : '';
  const maxPriceEcho = maxCents !== null ? String(maxCents / 100) : '';
  const t = await getTranslations({ locale, namespace: 'Discover' });
  const bt = await getTranslations({ locale, namespace: 'ProviderBadges' });
  const badgeLabels = {
    id_verified: bt('id_verified'),
    background_checked: bt('background_checked'),
    top_rated: bt('top_rated'),
    founding_provider: bt('founding_provider'),
    pro_verified: bt('pro_verified'),
  } as Record<BadgeKey, string>;
  const badgeHints = {
    id_verified: bt('id_verifiedHint'),
    background_checked: bt('background_checkedHint'),
    top_rated: bt('top_ratedHint'),
    founding_provider: bt('founding_providerHint'),
    pro_verified: bt('pro_verifiedHint'),
  } as Record<BadgeKey, string>;
  const tc = await getTranslations({ locale, namespace: 'Categories' });
  const tcg = await getTranslations({ locale, namespace: 'CategoryGroups' });
  const ts = await getTranslations({ locale, namespace: 'Subcategories' });
  const tp = await getTranslations({ locale, namespace: 'Provider' });
  const tprod = await getTranslations({ locale, namespace: 'Products' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // User's country drives "near" filtering, local-first ranking, and badges.
  let userCountry: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('country')
      .eq('id', user.id)
      .single();
    userCountry = profile?.country ?? null;
  }

  // Prices are shown in the viewer's own currency; each listing's price
  // is denominated in its provider's currency (listing.country).
  const viewerCurrency = currencyForCountry(userCountry);

  let nearCountry: string | null = null;
  if (scope === 'near') {
    nearCountry = userCountry;
  }

  const activeSubcategory =
    subcategory && isSubcategory(category, subcategory) ? subcategory : '';

  const term = q.trim();
  const clean = term.replace(/[%_]/g, '');

  // Problem-based search: resolve phrases like "leaky faucet" to categories
  // via search_synonyms (current locale + English fallback). Resolved up
  // front so the listing query can be built (and rebuilt) in one place.
  let synonymCategories: string[] = [];
  if (term && !(category && isCategory(category))) {
    const like = `%${clean}%`;
    const { data: syns } = await supabase
      .from('search_synonyms')
      .select('category')
      .or(`locale.eq.${locale},locale.eq.en`)
      .ilike('phrase', like);
    synonymCategories = [
      ...new Set((syns ?? []).map((s: { category: string }) => s.category)),
    ].filter(isCategory);
  }

  // latitude/longitude arrive with migration 0032_listing_coordinates; until
  // it is applied, selecting them fails with PostgREST 42703 and we fall
  // back to the coordinate-free select so the page never breaks.
  const PROVIDERS_SELECT =
    'providers!inner(id, business_name, verified, verification_badge, trust_level, rating_avg, review_count, completed_jobs, city, country, next_available_date, audited_until, id_verified, background_check_passed, pro_verified, created_at)';
  // Minimal provider columns guaranteed by migration 0004 (core table).
  // Used as final fallback if optional badge/trust columns are missing.
  const PROVIDERS_SELECT_MINIMAL =
    'providers!inner(id, business_name, verified, rating_avg, review_count, city, country, created_at)';
  const SELECT_WITH_COORDS = `id, title, category, subcategory, price_cents, price_type, country, city, latitude, longitude, is_featured, featured_priority, ${PROVIDERS_SELECT}`;
  const SELECT_BASE = `id, title, category, subcategory, price_cents, price_type, country, city, is_featured, featured_priority, ${PROVIDERS_SELECT}`;

  function buildQuery(select: string) {
    // `db` (not `supabase`) — TS narrowing of a possibly-null variable is
    // lost inside this closure, so capture the non-null client once.
    let qq = db
      .from('listings')
      .select(select)
      .eq('status', 'active')
      .order('featured_priority', { ascending: false })
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });

    if (category && isCategory(category)) qq = qq.eq('category', category);
    if (activeSubcategory) qq = qq.eq('subcategory', activeSubcategory);
    if (nearCountry) qq = qq.eq('country', nearCountry);
    // Price range filter (cents). Quote listings (null price) are excluded
    // when a price bound is active — they can't be range-matched.
    if (minCents !== null) qq = qq.gte('price_cents', minCents);
    if (maxCents !== null) qq = qq.lte('price_cents', maxCents);

    if (term) {
      const like = `%${clean}%`;
      if (category && isCategory(category)) {
        // Category chip selected: plain text match is enough.
        qq = qq.or(`title.ilike.${like},description.ilike.${like}`);
      } else {
        const orParts = [
          `title.ilike.${like}`,
          `description.ilike.${like}`,
          ...synonymCategories.map((c) => `category.eq.${c}`),
        ];
        qq = qq.or(orParts.join(','));
      }
    }
    return qq;
  }

  let queryResult = (await buildQuery(SELECT_WITH_COORDS)) as {
    data: DiscoverListing[] | null;
    error: { code?: string } | null;
  };
  // Fallback chain: coords → base → minimal (handles PGRST204 schema cache
  // misses after migrations, as well as 42703 undefined columns).
  const MISSING_COL_CODES = ['42703', 'PGRST204'];
  if (queryResult.error && MISSING_COL_CODES.includes(queryResult.error.code || '')) {
    queryResult = (await buildQuery(SELECT_BASE)) as {
      data: DiscoverListing[] | null;
      error: { code?: string } | null;
    };
  }
  if (queryResult.error && MISSING_COL_CODES.includes(queryResult.error.code || '')) {
    // Minimal: only core columns guaranteed by migrations 0004/0005.
    // Uses PROVIDERS_SELECT_MINIMAL to avoid missing badge/trust columns.
    const SELECT_MINIMAL = `id, title, category, price_cents, price_type, country, city, ${PROVIDERS_SELECT_MINIMAL}`;
    queryResult = (await buildQuery(SELECT_MINIMAL)) as {
      data: DiscoverListing[] | null;
      error: { code?: string } | null;
    };
  }
  let listings = queryResult.data ?? [];

  // --- Urgency filter (needs provider availability) ---
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayDow = today.getDay();
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let slotsByProvider = new Map<string, Set<number>>();
  if (urgency !== 'flexible' && listings.length > 0) {
    const providerIds = [
      ...new Set(listings.map((l) => l.providers?.id).filter(Boolean) as string[]),
    ];
    if (providerIds.length > 0) {
      const { data: slots } = (await supabase
        .from('availability')
        .select('provider_id, weekday')
        .in('provider_id', providerIds)) as {
        data: { provider_id: string; weekday: number }[] | null;
      };
      slotsByProvider = new Map<string, Set<number>>();
      for (const s of slots ?? []) {
        if (!slotsByProvider.has(s.provider_id)) {
          slotsByProvider.set(s.provider_id, new Set());
        }
        slotsByProvider.get(s.provider_id)!.add(s.weekday);
      }
    }
  }

  function isAvailableToday(l: DiscoverListing): boolean {
    const nad = l.providers?.next_available_date;
    if (nad && nad <= todayStr) return true;
    const days = l.providers?.id ? slotsByProvider.get(l.providers.id) : undefined;
    return days?.has(todayDow) ?? false;
  }

  function isAvailableThisWeek(l: DiscoverListing): boolean {
    const nad = l.providers?.next_available_date;
    if (nad && nad <= weekFromNow) return true;
    const days = l.providers?.id ? slotsByProvider.get(l.providers.id) : undefined;
    return !!days && days.size > 0;
  }

  if (urgency === 'today') {
    listings = listings.filter(isAvailableToday);
  } else if (urgency === 'week') {
    listings = listings.filter(isAvailableThisWeek);
  }

  // --- Sorting: user-selected, or the default local-first ranking ---
  if (sort === 'price_asc') {
    // Quote listings (null price) go last.
    listings = [...listings].sort((a, b) => {
      const ap = a.price_cents ?? Number.POSITIVE_INFINITY;
      const bp = b.price_cents ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    });
  } else if (sort === 'price_desc') {
    listings = [...listings].sort((a, b) => {
      const ap = a.price_cents ?? Number.NEGATIVE_INFINITY;
      const bp = b.price_cents ?? Number.NEGATIVE_INFINITY;
      return bp - ap;
    });
  } else if (sort === 'rating') {
    listings = [...listings].sort(
      (a, b) => (b.providers?.rating_avg ?? 0) - (a.providers?.rating_avg ?? 0)
    );
  } else if (sort === 'reviews') {
    listings = [...listings].sort(
      (a, b) => (b.providers?.review_count ?? 0) - (a.providers?.review_count ?? 0)
    );
  } else {
    // --- Local-first ranking: featured priority → featured → in-region → jobs → rating ---
    listings = [...listings].sort((a, b) => {
      const aPrio = a.featured_priority ?? 0;
      const bPrio = b.featured_priority ?? 0;
      if (aPrio !== bPrio) return bPrio - aPrio;
      if (!!a.is_featured !== !!b.is_featured) return a.is_featured ? -1 : 1;
      const aNear = userCountry && a.country === userCountry ? 1 : 0;
      const bNear = userCountry && b.country === userCountry ? 1 : 0;
      if (aNear !== bNear) return bNear - aNear;
      const aJobs = a.providers?.completed_jobs ?? 0;
      const bJobs = b.providers?.completed_jobs ?? 0;
      if (aJobs !== bJobs) return bJobs - aJobs;
      return (b.providers?.rating_avg ?? 0) - (a.providers?.rating_avg ?? 0);
    });
  }

  // Pins for the map view — listings without coordinates are skipped.
  const mapListings: MapListing[] = listings.flatMap((l) =>
    l.latitude != null && l.longitude != null
      ? [{ id: l.id, title: l.title, lat: l.latitude, lng: l.longitude }]
      : []
  );

  const chip =
    'inline-flex min-h-[44px] items-center rounded-full border-2 px-5 text-sm font-semibold transition-colors';

  const urgencyOptions: Urgency[] = ['today', 'week', 'flexible'];
  const urgencyLabels: Record<Urgency, string> = {
    today: t('urgencyToday'),
    week: t('urgencyWeek'),
    flexible: t('urgencyFlexible'),
  };

  // Spotlight providers: paid 7-day profile highlights. Shown only when
  // the visitor isn't filtering (spotlight is a discovery surface).
  type SpotlightProvider = {
    id: string;
    business_name: string;
    category: string;
    city: string | null;
    country: string;
    rating_avg: number | null;
    review_count: number | null;
    verification_badge: boolean | null;
    // NOTE: requires migration 0035; null-safe until applied.
    audited_until: string | null;
  };
  let spotlights: SpotlightProvider[] = [];
  if (!category && !term) {
    const { data: sp } = await supabase
      .from('providers')
      .select('id, business_name, category, city, country, rating_avg, review_count, verification_badge, audited_until')
      .eq('status', 'approved')
      .gt('spotlight_until', new Date().toISOString())
      .order('spotlight_until', { ascending: false })
      .limit(6);
    spotlights = (sp as SpotlightProvider[] | null) ?? [];
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
        <p className="mt-1 text-base text-brand-700">{t('subtitle')}</p>
      </div>

      {/* First-Session Guarantee banner for covered categories */}
      {category && isGuaranteeCategory(category) && (
        <Link
          href="/guarantee"
          className="flex items-center gap-3 rounded-2xl border-2 border-brand-200 bg-brand-50 p-4 transition-all hover:scale-[1.01] hover:border-brand-400 hover:shadow-md"
        >
          <span className="text-3xl" aria-hidden="true">
            🛡️
          </span>
          <span>
            <span className="block text-sm font-extrabold text-brand-900">
              {t('guaranteeBannerTitle')}
            </span>
            <span className="block text-sm text-brand-700">
              {t('guaranteeBannerText')}
            </span>
          </span>
        </Link>
      )}

      {/* Search */}
      <form method="get" className="flex gap-2">
        <input type="hidden" name="scope" value={scope} />
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {activeSubcategory ? (
          <input type="hidden" name="subcategory" value={activeSubcategory} />
        ) : null}
        {urgency !== 'flexible' ? <input type="hidden" name="urgency" value={urgency} /> : null}
        {minPriceEcho ? <input type="hidden" name="minPrice" value={minPriceEcho} /> : null}
        {maxPriceEcho ? <input type="hidden" name="maxPrice" value={maxPriceEcho} /> : null}
        {sort !== 'relevance' ? <input type="hidden" name="sort" value={sort} /> : null}
        <label htmlFor="discover-q" className="sr-only">
          {t('searchLabel')}
        </label>
        <input
          id="discover-q"
          name="q"
          defaultValue={term}
          placeholder={t('searchPlaceholder')}
          className="auth-input min-h-[56px] flex-1 rounded-2xl px-4 text-base"
        />
        <button
          type="submit"
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700"
        >
          {t('searchButton')}
        </button>
      </form>

      {/* Worldwide / Near me */}
      <div className="flex gap-2" role="group" aria-label={t('scopeLabel')}>
        <Link
          href={scopeHref('worldwide', term, category, activeSubcategory, urgency, minPriceEcho, maxPriceEcho, sort)}
          aria-pressed={scope !== 'near'}
          className={`${chip} ${
            scope !== 'near'
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-brand-200 bg-white text-brand-700'
          }`}
        >
          {t('worldwide')}
        </Link>
        <Link
          href={scopeHref('near', term, category, activeSubcategory, urgency, minPriceEcho, maxPriceEcho, sort)}
          aria-pressed={scope === 'near'}
          className={`${chip} ${
            scope === 'near'
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-brand-200 bg-white text-brand-700'
          }`}
        >
          {t('nearMe')}
        </Link>
      </div>
      {scope === 'near' && !user ? (
        <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {t('nearMeSignInHint')}
        </p>
      ) : null}

      {/* Urgency filter */}
      <div>
        <p className="mb-2 text-sm font-semibold text-brand-700">{t('urgencyLabel')}</p>
        <div className="flex gap-2" role="group" aria-label={t('urgencyLabel')}>
          {urgencyOptions.map((u) => (
            <Link
              key={u}
              href={withParams('/discover', term, category, activeSubcategory, scope, u, minPriceEcho, maxPriceEcho, sort)}
              aria-pressed={urgency === u}
              className={`${chip} ${
                urgency === u
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-brand-200 bg-white text-brand-700'
              }`}
            >
              {urgencyLabels[u]}
            </Link>
          ))}
        </div>
      </div>

      {/* Price range + sort */}
      <form method="get" className="space-y-3 rounded-2xl border-2 border-brand-100 bg-white p-4">
        <input type="hidden" name="scope" value={scope} />
        {term ? <input type="hidden" name="q" value={term} /> : null}
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {activeSubcategory ? (
          <input type="hidden" name="subcategory" value={activeSubcategory} />
        ) : null}
        {urgency !== 'flexible' ? <input type="hidden" name="urgency" value={urgency} /> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="discover-minprice" className="mb-1 block text-sm font-semibold text-brand-700">
              {t('minPriceLabel')}
            </label>
            <input
              id="discover-minprice"
              name="minPrice"
              type="number"
              min="0"
              inputMode="decimal"
              defaultValue={minPriceEcho}
              placeholder="0"
              className="auth-input min-h-[48px] w-full rounded-2xl px-4 text-base"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="discover-maxprice" className="mb-1 block text-sm font-semibold text-brand-700">
              {t('maxPriceLabel')}
            </label>
            <input
              id="discover-maxprice"
              name="maxPrice"
              type="number"
              min="0"
              inputMode="decimal"
              defaultValue={maxPriceEcho}
              placeholder={t('maxPricePlaceholder')}
              className="auth-input min-h-[48px] w-full rounded-2xl px-4 text-base"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="discover-sort" className="mb-1 block text-sm font-semibold text-brand-700">
              {t('sortLabel')}
            </label>
            <select
              id="discover-sort"
              name="sort"
              defaultValue={sort}
              className="auth-input min-h-[48px] w-full rounded-2xl px-4 text-base"
            >
              <option value="relevance">{t('sortRelevance')}</option>
              <option value="price_asc">{t('sortPriceAsc')}</option>
              <option value="price_desc">{t('sortPriceDesc')}</option>
              <option value="rating">{t('sortRating')}</option>
              <option value="reviews">{t('sortReviews')}</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700"
          >
            {t('applyFilters')}
          </button>
        </div>
        {(minCents !== null || maxCents !== null || sort !== 'relevance') && (
          <div>
            <Link
              href={withParams('/discover', term, category, activeSubcategory, scope, urgency)}
              className="text-sm font-semibold text-brand-600 underline hover:text-brand-800"
            >
              {t('clearFilters')}
            </Link>
          </div>
        )}
      </form>

      {/* Category chips, grouped and sorted */}
      <div>
        <p className="mb-2 text-sm font-semibold text-brand-700">{t('browseCategories')}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={withParams('/discover', term, '', '', scope, urgency, minPriceEcho, maxPriceEcho, sort)}
            aria-pressed={category === ''}
            className={`${chip} ${
              category === ''
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-brand-200 bg-white text-brand-700'
            }`}
          >
            {t('allCategories')}
          </Link>
        </div>
      </div>
      <div className="mt-3 space-y-4">
        {categoryGroups.map((group) => (
          <div key={group.key}>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-500">
              {tcg(group.key)}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.categories.map((c) => (
                <Link
                  key={c}
                  href={withParams('/discover', term, c, '', scope, urgency, minPriceEcho, maxPriceEcho, sort)}
                  aria-pressed={category === c}
                  className={`${chip} ${
                    category === c
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-brand-200 bg-white text-brand-700'
                  }`}
                >
                  {tc(c)}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Subcategory chips — shown once a category is picked */}
      {category && isCategory(category) ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-brand-700">
            {t('subcategoryLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withParams('/discover', term, category, '', scope, urgency, minPriceEcho, maxPriceEcho, sort)}
              aria-pressed={activeSubcategory === ''}
              className={`${chip} ${
                activeSubcategory === ''
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-brand-200 bg-white text-brand-700'
              }`}
            >
              {t('allSubcategories')}
            </Link>
            {subcategories[category].map((s) => (
              <Link
                key={s}
                href={withParams('/discover', term, category, s, scope, urgency, minPriceEcho, maxPriceEcho, sort)}
                aria-pressed={activeSubcategory === s}
                className={`${chip} ${
                  activeSubcategory === s
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-brand-200 bg-white text-brand-700'
                }`}
              >
                {ts(s)}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Spotlight providers — paid 7-day highlights */}
      {spotlights.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-700">
            🔦 {t('spotlightTitle')}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {spotlights.map((sp) => (
              <div
                key={sp.id}
                className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"
              >
                <p className="text-base font-bold text-brand-900">
                  {sp.business_name}{' '}
                  {sp.verification_badge ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                      ✓ {t('verifiedBadge')}
                    </span>
                  ) : null}{' '}
                  <AuditedBadge auditedUntil={sp.audited_until} locale={locale} />
                </p>
                <p className="mt-1 text-sm text-brand-700">
                  {tc(sp.category as 'cleaning')} ·{' '}
                  {[sp.city, sp.country ? countryName(sp.country) : null]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {sp.rating_avg !== null && sp.rating_avg !== undefined ? (
                  <p className="mt-1 text-sm font-semibold text-brand-800">
                    ⭐ {Number(sp.rating_avg).toFixed(1)} ({sp.review_count ?? 0})
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Anti-scammer safety banner for buy/sell & rentals */}
      {['buy_sell', 'room_rentals', 'house_rent', 'basement_suite', 'apartment_condo'].includes(category) ? (
        <SafetyBanner locale={locale} />
      ) : null}

      {/* Results — list / map toggle */}
      <DiscoverResults mapListings={mapListings}>
      {listings.length === 0 ? (
        <Panel>
          <div className="py-4 text-center">
            <div className="text-5xl" aria-hidden="true">
              🔍
            </div>
            <p className="mt-4 text-base font-semibold text-brand-900">
              {t('noResults')}
            </p>
            <p className="mt-2 text-sm text-brand-700">{t('noResultsHint')}</p>
            <Link
              href="/signup"
              className="mt-6 inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700"
            >
              {t('noResultsCta')}
            </Link>
          </div>
        </Panel>
      ) : (
        <>
          <p className="text-sm font-semibold text-brand-700">
            {t('resultsCount', { count: listings.length })}
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {listings.map((listing) => {
              const nearYou = !!userCountry && listing.country === userCountry;
              const availableToday =
                urgency === 'flexible' ? isAvailableToday(listing) : true;
              return (
                <li key={listing.id}>
                  <Link
                    href={`/listings/${listing.id}`}
                    className="block h-full rounded-3xl bg-white p-5 shadow transition-shadow hover:shadow-md"
                  >
                    {/* Photo placeholder (Phase 2: photo upload arrives with Storage) */}
                    <div
                      className="mb-4 flex h-32 items-center justify-center rounded-2xl bg-brand-50"
                      aria-hidden="true"
                    >
                      <span className="text-4xl">🛠️</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-lg font-bold text-brand-900">{listing.title}</h2>
                      {listing.providers ? (
                        <TrustBadge
                          level={listing.providers.trust_level ?? 'new'}
                          ratingAvg={listing.providers.rating_avg}
                          reviewCount={listing.providers.review_count}
                          completedJobs={listing.providers.completed_jobs}
                          variant="compact"
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-brand-700">
                      {listing.providers?.business_name ?? ''} · {countryName(listing.country)}{' '}
                      {listing.providers?.verification_badge ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                          ✓ {t('verifiedBadge')}
                        </span>
                      ) : null}{' '}
                      <AuditedBadge auditedUntil={listing.providers?.audited_until} locale={locale} />
                    </p>
                    {listing.providers ? (
                      <div className="mt-1.5">
                        <VerificationBadges
                          badges={getProviderBadges(listing.providers)}
                          labels={badgeLabels}
                          hints={badgeHints}
                          max={3}
                        />
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {nearYou ? (
                        <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
                          📍 {t('nearYou')}
                        </span>
                      ) : null}
                      {availableToday ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          ⚡ {t('availableToday')}
                        </span>
                      ) : null}
                    </div>
                    {listing.providers &&
                    (listing.providers.rating_avg || listing.providers.completed_jobs) ? (
                      <p className="mt-1 text-xs text-brand-600">
                        {listing.providers.rating_avg
                          ? `⭐ ${Number(listing.providers.rating_avg).toFixed(1)}`
                          : ''}
                        {listing.providers.rating_avg && listing.providers.completed_jobs
                          ? ' · '
                          : ''}
                        {listing.providers.completed_jobs
                          ? `${listing.providers.completed_jobs} jobs done`
                          : ''}
                      </p>
                    ) : null}
                    <p className="mt-2 text-base font-bold text-brand-800">
                      {formatListingPrice(
                        listing.price_cents,
                        listing.price_type,
                        currencyForCountry(listing.country),
                        viewerCurrency,
                        {
                          quote: tp('priceQuote'),
                          hourlySuffix: tp('perHour'),
                          fixedSuffix: tp('perJob'),
                        },
                        locale
                      )}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-500">
                      {listing.subcategory && isSubcategory(listing.category, listing.subcategory)
                        ? ts(listing.subcategory as Subcategory)
                        : tc(listing.category as 'cleaning')}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      </DiscoverResults>

      {/* Products — physical goods from provider shops (CJ Dropshipping) */}
      <ProductsSection t={tprod} locale={locale} />
    </div>
  );
}

/** Shop products strip (server component, degrades to nothing when empty). */
async function ProductsSection({
  t,
  locale,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  locale: string;
}) {
  let products: Awaited<ReturnType<typeof getActiveProducts>> = [];
  try {
    products = await getActiveProducts(12, 0);
  } catch {
    products = [];
  }
  if (products.length === 0) return null;
  return (
    <section className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-900">🛍️ {t('shopTitle')}</h2>
      </div>
      <p className="-mt-2 text-sm text-brand-600">{t('shopSubtitle')}</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((p) => (
          <li key={p.id}>
            <Link
              href={localizedPath(`/products/${p.id}`, locale)}
              className="block overflow-hidden rounded-2xl border-2 border-brand-100 bg-white transition-shadow hover:shadow-lg"
            >
              {p.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.images[0]}
                  alt={p.name}
                  className="h-36 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-36 w-full items-center justify-center bg-brand-100 text-3xl">
                  📦
                </div>
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-bold text-brand-900">{p.name}</p>
                <p className="mt-1 text-base font-bold text-brand-700">
                  {(p.price_cents / 100).toFixed(2)} {p.currency.toUpperCase()}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
