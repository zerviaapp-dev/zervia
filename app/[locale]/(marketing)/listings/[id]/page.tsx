import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { TrustBadge, type TrustLevel } from '@/components/TrustBadge';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { ReportButton } from '@/components/moderation/ReportButton';
import { createClient } from '@/lib/supabase/server';
import { countryName } from '@/lib/countries';
import { localeNames, type Locale } from '@/lib/locales';
import { currencyForCountry, formatListingPrice } from '@/lib/currency';

type DetailListing = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price_cents: number | null;
  price_type: string;
  country: string;
  city: string | null;
  status: string;
  photos: unknown;
  providers: {
    id: string;
    business_name: string;
    description: string | null;
    verified: boolean;
    verification_badge: boolean | null;
    trust_level: TrustLevel;
    completed_jobs: number | null;
    phone: string | null;
    whatsapp: string | null;
    city: string | null;
    country: string;
    languages: string[] | null;
    rating_avg: number | null;
    review_count: number | null;
    avg_response_minutes: number | null;
  } | null;
};

type ReviewItem = {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
};

/**
 * Public listing detail. RLS decides visibility: anonymous visitors see
 * active listings of approved providers; owners also see their own drafts.
 * Anything else → 404 (never a leak, never a hint it exists).
 */
export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'Discover' });
  const tc = await getTranslations({ locale, namespace: 'Categories' });
  const tp = await getTranslations({ locale, namespace: 'Provider' });
  const ts = await getTranslations({ locale, namespace: 'Subcategories' });
  const tb = await getTranslations({ locale, namespace: 'Bookings' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const { data } = (await supabase
    .from('listings')
    .select(
      'id, title, description, category, subcategory, price_cents, price_type, country, city, status, photos, providers!inner(id, business_name, description, verified, verification_badge, trust_level, completed_jobs, phone, whatsapp, city, country, languages, rating_avg, review_count, avg_response_minutes)'
    )
    .eq('id', id)
    .maybeSingle()) as { data: DetailListing | null };

  if (!data) {
    notFound();
  }

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const photos = Array.isArray(data.photos) ? (data.photos as string[]) : [];

  // Viewer currency for price display; the listing price is denominated
  // in the provider's currency (data.country).
  let viewerCountry: string | null = null;
  if (viewer) {
    const { data: viewerProfile } = await supabase
      .from('profiles')
      .select('country')
      .eq('id', viewer.id)
      .single();
    viewerCountry = viewerProfile?.country ?? null;
  }
  const viewerCurrency = currencyForCountry(viewerCountry);

  // Public reviews for this provider (RLS: public read), newest first.
  const { data: reviews } = (await supabase
    .from('reviews')
    .select('id, rating, text, created_at')
    .eq('provider_id', data.providers?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(10)) as { data: ReviewItem[] | null };

  const provider = data.providers;
  const whatsappHref = provider?.whatsapp
    ? `https://wa.me/${provider.whatsapp.replace(/[^0-9]/g, '')}`
    : null;

  // Service structured data for search engines.
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: data.title,
    description: data.description ?? undefined,
    url: `https://zervia-app-deploy.vercel.app/${locale}/listings/${data.id}`,
    serviceType: data.category,
    ...(data.price_cents != null
      ? {
          offers: {
            '@type': 'Offer',
            price: (data.price_cents / 100).toFixed(2),
            priceCurrency: currencyForCountry(data.country).toUpperCase(),
          },
        }
      : {}),
    ...(provider
      ? {
          provider: {
            '@type': 'LocalBusiness',
            name: provider.business_name,
            ...(provider.rating_avg != null && provider.rating_avg > 0
              ? {
                  aggregateRating: {
                    '@type': 'AggregateRating',
                    ratingValue: provider.rating_avg,
                    reviewCount: provider.review_count,
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  return (
    <div className="space-y-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <Link
        href="/discover"
        className="inline-flex min-h-[44px] items-center text-base font-semibold text-brand-700"
      >
        ← {t('backToDiscover')}
      </Link>

      <div
        className="flex h-48 items-center justify-center overflow-hidden rounded-3xl bg-brand-50"
        aria-hidden={photos.length === 0}
      >
        {photos.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photos[0]}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-6xl">🛠️</span>
        )}
      </div>

      {photos.length > 1 ? (
        <div className="grid grid-cols-4 gap-2" role="list" aria-label={t('photoGallery')}>
          {photos.slice(1, 5).map((url) => (
            <div key={url} role="listitem" className="overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-900">{data.title}</h1>
        {provider ? (
          <TrustBadge
            level={provider.trust_level ?? 'new'}
            ratingAvg={provider.rating_avg}
            reviewCount={provider.review_count}
            completedJobs={provider.completed_jobs}
            variant="compact"
          />
        ) : null}
      </div>

      <p className="text-xl font-bold text-brand-800">
        {formatListingPrice(
          data.price_cents,
          data.price_type,
          currencyForCountry(data.country),
          viewerCurrency,
          {
            quote: tp('priceQuote'),
            hourlySuffix: tp('perHour'),
            fixedSuffix: tp('perJob'),
          },
          locale
        )}
      </p>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">
        {data.subcategory ? `${ts(data.subcategory as 'house_cleaning')} · ` : null}{tc(data.category as 'cleaning')} ·{' '}
        {[data.city, countryName(data.country)].filter(Boolean).join(', ')}
      </p>

      {data.description ? (
        <Panel>
          <p className="whitespace-pre-wrap text-base text-brand-800">{data.description}</p>
        </Panel>
      ) : null}

      {provider ? (
        <Panel>
          <h2 className="text-xl font-bold text-brand-900">{t('aboutProvider')}</h2>
          <p className="mt-2 text-base font-semibold text-brand-800">
            {provider.business_name}{' '}
            {provider.verification_badge ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-0.5 text-sm font-bold text-green-800">
                ✓ {t('verifiedBadge')}
              </span>
            ) : null}
          </p>
          <TrustBadge
            level={provider.trust_level ?? 'new'}
            ratingAvg={provider.rating_avg}
            reviewCount={provider.review_count}
            completedJobs={provider.completed_jobs}
            variant="full"
          />
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            <span aria-hidden="true">💬</span>
            {provider.avg_response_minutes !== null &&
            provider.avg_response_minutes !== undefined
              ? provider.avg_response_minutes < 60
                ? tb('respondsInMinutes', {
                    count: provider.avg_response_minutes,
                  })
                : tb('respondsInHours', {
                    count: Math.round(provider.avg_response_minutes / 60),
                  })
              : tb('respondsNoData')}
          </p>
          {provider.description ? (
            <p className="mt-1 text-sm text-brand-700">{provider.description}</p>
          ) : null}
          {(provider.languages ?? []).length > 0 ? (
            <p className="mt-2 text-sm text-brand-700">
              {t('languagesSpoken')}:{' '}
              {(provider.languages ?? [])
                .map((l) => localeNames[l as Locale] ?? l)
                .join(', ')}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/listings/${data.id}/book/new`}
              className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700"
            >
              {tb('bookingCta')}
            </Link>
            {provider.phone ? (
              <a
                href={`tel:${provider.phone.replace(/[^0-9+]/g, '')}`}
                className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700 hover:border-brand-400"
              >
                {t('callProvider')}
              </a>
            ) : null}
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50"
              >
                {t('whatsappProvider')}
              </a>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-brand-500">{tb('bookingCtaNote')}</p>
        </Panel>
      ) : null}

      {/* Public reviews for this provider */}
      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{tb('reviewsTitle')}</h2>        {!reviews || reviews.length === 0 ? (
          <p className="mt-2 text-base text-brand-700">{tb('noReviews')}</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-brand-100 pt-3">
                <p
                  className="text-base font-bold text-brand-900"
                  aria-label={tb('stars', { count: r.rating })}
                >
                  <span aria-hidden="true">{'⭐'.repeat(r.rating)}</span>
                </p>
                {r.text ? (
                  <p className="mt-1 whitespace-pre-wrap text-base text-brand-800">
                    {r.text}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-brand-500">
                  {new Date(r.created_at).toLocaleDateString(locale, {
                    dateStyle: 'medium',
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Trust: report this listing if something looks wrong */}
      <div className="flex justify-center pt-2">
        <ReportButton
          listingId={data.id}
          providerId={provider?.id}
          signedIn={Boolean(viewer)}
        />
      </div>
    </div>
  );
}
