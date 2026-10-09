import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { TrustBadge, type TrustLevel } from '@/components/TrustBadge';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { categoryGroups, subcategories, isCategory, isSubcategory, type Subcategory } from '@/lib/categories';
import { countryName } from '@/lib/countries';
import { currencyForCountry, formatListingPrice } from '@/lib/currency';

type DiscoverListing = {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  price_cents: number | null;
  price_type: string;
  country: string;
  city: string | null;
  is_featured: boolean;
  featured_priority: number;
  providers: {
    id: string;
    business_name: string;
    verified: boolean;
    trust_level: TrustLevel;
    rating_avg: number | null;
    review_count: number | null;
    completed_jobs: number | null;
    city: string | null;
    country: string;
    next_available_date: string | null;
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
): string {
  const params = new URLSearchParams();
  if (scope !== 'worldwide') params.set('scope', scope);
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (subcategory) params.set('subcategory', subcategory);
  if (urgency !== 'flexible') params.set('urgency', urgency);
  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ''}`;
}

function scopeHref(scope: string, q: string, category: string, subcategory: string, urgency: string): string {
  const params = new URLSearchParams();
  params.set('scope', scope);
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (subcategory) params.set('subcategory', subcategory);
  if (urgency !== 'flexible') params.set('urgency', urgency);
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
  }>;
}) {
  const { locale } = await params;
  const {
    q = '',
    category = '',
    subcategory = '',
    scope = 'worldwide',
    urgency: urgencyRaw = 'flexible',
  } = await searchParams;
  const urgency: Urgency = isUrgency(urgencyRaw) ? urgencyRaw : 'flexible';
  const t = await getTranslations({ locale, namespace: 'Discover' });
  const tc = await getTranslations({ locale, namespace: 'Categories' });
  const tcg = await getTranslations({ locale, namespace: 'CategoryGroups' });
  const ts = await getTranslations({ locale, namespace: 'Subcategories' });
  const tp = await getTranslations({ locale, namespace: 'Provider' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

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

  let query = supabase
    .from('listings')
    .select(
      'id, title, category, subcategory, price_cents, price_type, country, city, is_featured, featured_priority, providers!inner(id, business_name, verified, trust_level, rating_avg, review_count, completed_jobs, city, country, next_available_date)'
    )
    .eq('status', 'active')
    .order('featured_priority', { ascending: false })
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (category && isCategory(category)) query = query.eq('category', category);
  const activeSubcategory =
    subcategory && isSubcategory(category, subcategory) ? subcategory : '';
  if (activeSubcategory) query = query.eq('subcategory', activeSubcategory);
  if (nearCountry) query = query.eq('country', nearCountry);

  const term = q.trim();
  const clean = term.replace(/[%_]/g, '');
  if (term) {
    const like = `%${clean}%`;
    if (category && isCategory(category)) {
      // Category chip selected: plain text match is enough.
      query = query.or(`title.ilike.${like},description.ilike.${like}`);
    } else {
      // Problem-based search: resolve phrases like "leaky faucet" to
      // categories via search_synonyms (current locale + English fallback).
      const { data: syns } = await supabase
        .from('search_synonyms')
        .select('category')
        .or(`locale.eq.${locale},locale.eq.en`)
        .ilike('phrase', like);
      const synonymCategories = [
        ...new Set((syns ?? []).map((s: { category: string }) => s.category)),
      ].filter(isCategory);
      const orParts = [
        `title.ilike.${like}`,
        `description.ilike.${like}`,
        ...synonymCategories.map((c) => `category.eq.${c}`),
      ];
      query = query.or(orParts.join(','));
    }
  }

  const { data } = (await query) as { data: DiscoverListing[] | null };
  let listings = data ?? [];

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
  };
  let spotlights: SpotlightProvider[] = [];
  if (!category && !term) {
    const { data: sp } = await supabase
      .from('providers')
      .select('id, business_name, category, city, country, rating_avg, review_count, verification_badge')
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

      {/* Search */}
      <form method="get" className="flex gap-2">
        <input type="hidden" name="scope" value={scope} />
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {activeSubcategory ? (
          <input type="hidden" name="subcategory" value={activeSubcategory} />
        ) : null}
        {urgency !== 'flexible' ? <input type="hidden" name="urgency" value={urgency} /> : null}
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
          href={scopeHref('worldwide', term, category, activeSubcategory, urgency)}
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
          href={scopeHref('near', term, category, activeSubcategory, urgency)}
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
              href={withParams('/discover', term, category, activeSubcategory, scope, u)}
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

      {/* Category chips, grouped and sorted */}
      <div>
        <p className="mb-2 text-sm font-semibold text-brand-700">{t('browseCategories')}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={withParams('/discover', term, '', '', scope, urgency)}
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
                  href={withParams('/discover', term, c, '', scope, urgency)}
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
              href={withParams('/discover', term, category, '', scope, urgency)}
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
                href={withParams('/discover', term, category, s, scope, urgency)}
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
                  ) : null}
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

      {/* Results */}
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
                      {listing.providers?.business_name ?? ''} · {countryName(listing.country)}
                    </p>
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
    </div>
  );
}
