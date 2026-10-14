import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { TrustBadge, type TrustLevel } from '@/components/TrustBadge';
import { currencyForCountry, formatListingPrice } from '@/lib/currency';
import { countryName } from '@/lib/countries';
import type { Category } from '@/lib/categories';

type TrendingListing = {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  price_cents: number | null;
  price_type: string;
  country: string;
  city: string | null;
  providers: {
    id: string;
    business_name: string;
    trust_level: TrustLevel;
    rating_avg: number | null;
    review_count: number | null;
    completed_jobs: number | null;
  } | null;
};

const PROVIDERS_SELECT =
  'providers!inner(id, business_name, trust_level, rating_avg, review_count, completed_jobs)';

const TRENDING_LIMIT = 8;
const TRENDING_WINDOW_DAYS = 30;

/**
 * "Trending Now" section for the homepage.
 * Ranks listings by completed/confirmed bookings in the last 30 days.
 * Falls back to highest-rated listings when booking data is unavailable
 * (new platform, or RLS hides bookings from anonymous visitors).
 * Returns null (renders nothing) when Supabase is not configured.
 */
export async function TrendingSection({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'Home' });
  const tc = await getTranslations({ locale, namespace: 'Categories' });
  const tp = await getTranslations({ locale, namespace: 'Provider' });
  const supabase = await createClient();
  if (!supabase) return null;

  let listings: TrendingListing[] = [];

  // 1. Try booking-driven trending: aggregate recent booking counts per listing.
  try {
    const since = new Date(
      Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: recent } = await supabase
      .from('bookings')
      .select('listing_id')
      .in('status', ['confirmed', 'completed'])
      .gte('created_at', since)
      .limit(500);

    if (recent && recent.length > 0) {
      const counts = new Map<string, number>();
      for (const b of recent as { listing_id: string }[]) {
        counts.set(b.listing_id, (counts.get(b.listing_id) ?? 0) + 1);
      }
      const topIds = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TRENDING_LIMIT)
        .map(([id]) => id);

      if (topIds.length > 0) {
        const { data } = await supabase
          .from('listings')
          .select(
            `id, title, category, subcategory, price_cents, price_type, country, city, ${PROVIDERS_SELECT}`
          )
          .eq('status', 'active')
          .in('id', topIds);
        const byId = new Map(
          ((data as TrendingListing[] | null) ?? []).map((l) => [l.id, l])
        );
        // Preserve trending rank order.
        listings = topIds
          .map((id) => byId.get(id))
          .filter((l): l is TrendingListing => !!l);
      }
    }
  } catch {
    listings = [];
  }

  // 2. Fallback: highest-rated active listings.
  if (listings.length === 0) {
    try {
      const { data } = await supabase
        .from('listings')
        .select(
          `id, title, category, subcategory, price_cents, price_type, country, city, ${PROVIDERS_SELECT}`
        )
        .eq('status', 'active')
        .limit(40);
      listings = ((data as TrendingListing[] | null) ?? [])
        .filter((l) => (l.providers?.rating_avg ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.providers?.rating_avg ?? 0) - (a.providers?.rating_avg ?? 0)
        )
        .slice(0, TRENDING_LIMIT);
    } catch {
      listings = [];
    }
  }

  if (listings.length === 0) return null;

  const viewerCurrency = currencyForCountry(null);

  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-12" aria-labelledby="trending-heading">
      <h2
        id="trending-heading"
        className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl"
      >
        🔥 {t('trendingTitle')}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-lg text-slate-600">
        {t('trendingSubtitle')}
      </p>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {listings.map((listing) => (
          <li key={listing.id}>
            <Link
              href={`/listings/${listing.id}`}
              className="block h-full rounded-3xl bg-white p-5 shadow transition-shadow hover:shadow-md"
            >
              <div
                className="mb-4 flex h-28 items-center justify-center rounded-2xl bg-brand-50"
                aria-hidden="true"
              >
                <span className="text-4xl">🛠️</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-base font-bold text-brand-900">
                  {listing.title}
                </h3>
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
                {listing.providers?.business_name ?? ''} ·{' '}
                {countryName(listing.country)}
              </p>
              {listing.providers?.rating_avg ? (
                <p className="mt-1 text-xs font-semibold text-brand-600">
                  ⭐ {Number(listing.providers.rating_avg).toFixed(1)}
                  {listing.providers.review_count
                    ? ` (${listing.providers.review_count})`
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
                {tc(listing.category as Category)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
