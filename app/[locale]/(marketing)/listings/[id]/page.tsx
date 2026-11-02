import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { TrustBadge, normalizeTrustLevel, type TrustLevel } from '@/components/TrustBadge';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AffiliateNote } from '@/components/AffiliateNote';
import { LegalNoticeBanner } from '@/components/LegalNoticeBanner';
import { FinancialNoticeBanner } from '@/components/FinancialNoticeBanner';
import { MatchRequestForm } from '@/components/booking/MatchRequestForm';
import { SafetyBanner } from '@/components/SafetyBanner';
import { InstantQuote } from '@/components/booking/InstantQuote';
import {
  resolveProviderTier,
  computeCommunityTrustScore,
} from '@/lib/provider-tiers';
import { createAdminClient } from '@/lib/supabase/admin';
import { CommunityTierNotice } from '@/components/community/CommunityTierNotice';
import { PreContactGate } from '@/components/community/PreContactGate';
import { CommunityFeedbackForm } from '@/components/community/CommunityFeedbackForm';
import { BlockButton } from '@/components/community/BlockButton';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
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
  // Map pin (migration 0044); null-safe until applied.
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  photos: unknown;
  providers: {
    id: string;
    business_name: string;
    description: string | null;
    trust_level: TrustLevel;
    completed_jobs: number | null;
    phone: string | null;
    whatsapp: string | null;
    // Connector model (migration 0048); null-safe until applied.
    external_booking_url?: string | null;
    // Two-tier launch (migration 0052); null-safe until applied.
    provider_tier?: string | null;
    city: string | null;
    country: string;
    languages: string[] | null;
    rating_avg: number | null;
    review_count: number | null;
    avg_response_minutes: number | null;
    created_at?: string | null;
  } | null;
};

type ReviewItem = {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  // NOTE: requires migration 0029; null-safe until applied.
  photo_urls: string[] | null;
};

type PortfolioItem = {
  id: string;
  photo_url: string;
  caption: string | null;
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
  const tconn = await getTranslations({ locale, namespace: 'Connect' });
  const tAuth = await getTranslations({ locale, namespace: 'Auth' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const SELECT_FULL =
    'id, title, description, category, subcategory, price_cents, price_type, country, city, status, photos, providers!inner(id, business_name, description, trust_level, completed_jobs, phone, whatsapp, external_booking_url, provider_tier, city, country, languages, rating_avg, review_count, avg_response_minutes, created_at)';
  // Same minus provider_tier (migration 0052 pending).
  const SELECT_NOTIER = SELECT_FULL.replace(', provider_tier', '');
  const SELECT_MINIMAL =
    'id, title, description, category, price_cents, price_type, country, city, status, providers!inner(id, business_name, rating_avg, review_count, city, country, created_at)';
  // Fallback chain (production schema lags local migrations):
  // MID  = full minus external_booking_url (0048 not yet applied)
  // MID2 = MID minus listings.subcategory (0026 not yet applied)
  // Without these, every listing fell back to MINIMAL and lost its
  // Call / WhatsApp contact actions.
  const SELECT_FULL_COORDS = SELECT_FULL.replace(
    'country, city, status, photos',
    'country, city, latitude, longitude, status, photos'
  );
  const SELECT_MID = SELECT_NOTIER.replace(', external_booking_url', '');
  const SELECT_MID2 = SELECT_MID.replace(', subcategory', '');

  let queryResult = (await supabase
    .from('listings')
    .select(SELECT_FULL_COORDS)
    .eq('id', id)
    .maybeSingle()) as { data: DetailListing | null; error: { code?: string } | null };

  if (queryResult.error && ['42703', 'PGRST204'].includes(queryResult.error.code || '')) {
    queryResult = (await supabase
      .from('listings')
      .select(SELECT_FULL)
      .eq('id', id)
      .maybeSingle()) as { data: DetailListing | null; error: { code?: string } | null };
  }

  if (queryResult.error && ['42703', 'PGRST204'].includes(queryResult.error.code || '')) {
    queryResult = (await supabase
      .from('listings')
      .select(SELECT_NOTIER)
      .eq('id', id)
      .maybeSingle()) as { data: DetailListing | null; error: { code?: string } | null };
  }

  // Fallback to minimal columns if optional badge/trust columns are missing
  // (PGRST204 schema cache miss or 42703 undefined column).
  if (queryResult.error && ['42703', 'PGRST204'].includes(queryResult.error.code || '')) {
    queryResult = (await supabase
      .from('listings')
      .select(SELECT_MID)
      .eq('id', id)
      .maybeSingle()) as { data: DetailListing | null; error: { code?: string } | null };
    if (queryResult.error && ['42703', 'PGRST204'].includes(queryResult.error.code || '')) {
      queryResult = (await supabase
        .from('listings')
        .select(SELECT_MID2)
        .eq('id', id)
        .maybeSingle()) as { data: DetailListing | null; error: { code?: string } | null };
    }
    if (queryResult.error && ['42703', 'PGRST204'].includes(queryResult.error.code || '')) {
      queryResult = (await supabase
        .from('listings')
        .select(SELECT_MINIMAL)
        .eq('id', id)
        .maybeSingle()) as { data: DetailListing | null; error: { code?: string } | null };
    }
  }

  const { data } = queryResult;

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
  // NOTE: photo_urls requires migration 0029; a failed select degrades to
  // "no reviews", same as before.
  const { data: reviews } = (await supabase
    .from('reviews')
    .select('id, rating, text, created_at, photo_urls')
    .eq('provider_id', data.providers?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(10)) as { data: ReviewItem[] | null };

  // Public portfolio: the provider's past-work gallery (migration 0029).
  let portfolio: PortfolioItem[] = [];
  try {
    const { data: pf } = (await supabase
      .from('portfolio_items')
      .select('id, photo_url, caption')
      .eq('provider_id', data.providers?.id ?? '')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(12)) as { data: PortfolioItem[] | null };
    portfolio = pf ?? [];
  } catch {
    portfolio = [];
  }

  const provider = data.providers;

  // --- Two-tier launch: Community provider handling -----------------
  const tcomm = await getTranslations({ locale, namespace: 'Community' });
  const providerTier = resolveProviderTier(provider);
  const isCommunity = providerTier === 'community';

  // First completed in-Zervia exchange (§7b): the viewer has a match
  // request naming this provider. Checked with the admin client
  // (support_messages are admin-read by RLS) — only a boolean is used.
  let hasExchanged = false;
  if (isCommunity && viewer && provider) {
    try {
      const admin = createAdminClient();
      if (admin) {
        const { data: reqs } = await admin
          .from('support_messages')
          .select('id')
          .eq('user_id', viewer.id)
          .eq('topic', 'match')
          .ilike('message', `%(${provider.business_name})%`)
          .limit(1);
        hasExchanged = (reqs ?? []).length > 0;
      }
    } catch {
      hasExchanged = false;
    }
  }
  // §7b: before the first exchange, NO external contact channels for
  // Community (no outside link, no phone, no WhatsApp). Verified
  // providers keep theirs (ID on file).
  const showExternalContact = !isCommunity || hasExchanged;

  // Community feedback + trust score (§7d). Feedback table may not
  // exist until migration 0052 — degrade to an empty list.
  type FeedbackItem = { id: string; rating: number; text: string | null; created_at: string };
  let communityFeedback: FeedbackItem[] = [];
  let trustScore: number | null = null;
  let serviceAreas: string[] = [];
  if (isCommunity && provider) {
    try {
      const { data: fb } = (await supabase
        .from('community_feedback')
        .select('id, rating, text, created_at')
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false })
        .limit(10)) as { data: FeedbackItem[] | null };
      communityFeedback = fb ?? [];
    } catch {
      communityFeedback = [];
    }
    try {
      const { data: areas } = (await supabase
        .from('community_service_areas')
        .select('label')
        .eq('provider_id', provider.id)
        .limit(2)) as { data: { label: string }[] | null };
      serviceAreas = (areas ?? []).map((a) => a.label);
    } catch {
      serviceAreas = [];
    }
    // Substantiated offences in the rolling 30-day window (admin count
    // only — no report content is exposed).
    let offences30d = 0;
    try {
      const admin = createAdminClient();
      if (admin) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await admin
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', provider.id)
          .eq('status', 'actioned')
          .gte('created_at', since);
        offences30d = count ?? 0;
      }
    } catch {
      offences30d = 0;
    }
    const fbAvg =
      communityFeedback.length > 0
        ? communityFeedback.reduce((sum, f) => sum + f.rating, 0) / communityFeedback.length
        : null;
    trustScore = computeCommunityTrustScore({
      feedbackAvg: fbAvg,
      feedbackCount: communityFeedback.length,
      completedJobs: provider.completed_jobs ?? 0,
      substantiatedOffences30d: offences30d,
    });
  }

  const whatsappHref = provider?.whatsapp
    ? `https://wa.me/${provider.whatsapp.replace(/[^0-9]/g, '')}`
    : null;

  // Service structured data for search engines.
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: data.title,
    description: data.description ?? undefined,
    url: `https://zervia.app/${locale}/listings/${data.id}`,
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
        // Escape `<` so a listing title/description containing `</script>`
        // can never break out of this tag (stored-XSS hardening).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd).replace(/</g, '\\u003c') }}
      />
      <Link
        href="/discover"
        className="inline-flex min-h-[44px] items-center text-base font-semibold text-brand-700"
      >
        ← {t('backToDiscover')}
      </Link>

      {/* Anti-scammer safety banner for buy/sell & rental listings */}
      {['buy_sell', 'room_rentals', 'house_rent', 'basement_suite', 'apartment_condo'].includes(data.category) ? (
        <SafetyBanner locale={locale} />
      ) : null}

      {isCommunity ? (
        <CommunityTierNotice
          variant="banner"
          label={tcomm('label')}
          disclaimer={tcomm('disclaimer')}
        />
      ) : null}

      {data.category === 'legal_services' ? (
        <LegalNoticeBanner locale={locale} />
      ) : null}

      {data.category === 'insurance' || data.category === 'mortgage_brokerage' ? (
        <FinancialNoticeBanner locale={locale} />
      ) : null}

      <div
        className="flex h-48 items-center justify-center overflow-hidden rounded-3xl bg-brand-50"
        aria-hidden={photos.length === 0}
      >
        {photos.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photos[0]}
            alt={`${data.title} — service photo`}
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
              <img src={url} alt={`${data.title} — photo`} className="aspect-square w-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-900">{data.title}</h1>
        {provider ? (
          <TrustBadge
            level={normalizeTrustLevel(provider.trust_level)}
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
      <p className="text-xs text-brand-500">{tconn('providerPriceNote')}</p>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">
        {data.subcategory ? `${ts(data.subcategory as 'house_cleaning')} · ` : null}{tc(data.category as 'cleaning')} ·{' '}
        {[data.city, countryName(data.country)].filter(Boolean).join(', ')}
      </p>

      {data.description ? (
        <Panel>
          <p className="whitespace-pre-wrap text-base text-brand-800">{data.description}</p>
        </Panel>
      ) : null}

      {/* Instant price estimate before messaging the provider. */}
      <InstantQuote
        category={data.category}
        priceCents={data.price_cents}
        priceType={data.price_type}
        currency={currencyForCountry(data.country)}
      />

      {provider ? (
        <Panel>
          <h2 className="text-xl font-bold text-brand-900">{t('aboutProvider')}</h2>
          <p className="mt-2 text-base font-semibold text-brand-800">
            {provider.business_name}
          </p>
          {/* P0-4 (D3): plain no-verification statement on every services surface. */}
          <p className="mt-1 text-xs text-brand-500">{t('notVerifiedNote')}</p>
          <TrustBadge
            level={normalizeTrustLevel(provider.trust_level)}
            ratingAvg={provider.rating_avg}
            reviewCount={provider.review_count}
            completedJobs={provider.completed_jobs}
            variant="full"
          />
          {isCommunity ? (
            <div className="mt-3 space-y-1">
              <CommunityTierNotice label={tcomm('label')} disclaimer={tcomm('disclaimer')} />
              <p className="text-sm text-brand-700">{tcomm('locationNote')}</p>
              {trustScore !== null ? (
                <p className="text-sm font-semibold text-brand-800">
                  {tcomm('trustScoreLabel')}: {trustScore}/100 ·{' '}
                  {tcomm('trustScoreJobs', { count: provider.completed_jobs ?? 0 })}
                </p>
              ) : null}
              {serviceAreas.length > 0 ? (
                <p className="text-sm text-brand-700">
                  📍 {serviceAreas.join(' · ')}
                </p>
              ) : null}
            </div>
          ) : null}
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
          <p className="mt-3">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                data.latitude != null && data.longitude != null
                  ? `${data.latitude},${data.longitude}`
                  : [provider.business_name, data.city, countryName(data.country)]
                      .filter(Boolean)
                      .join(' ')
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brand-200 bg-white px-5 text-sm font-semibold text-brand-700 hover:border-brand-400"
            >
              📍 {t('viewOnMaps')}
            </a>
          </p>
          {(provider.languages ?? []).length > 0 ? (
            <p className="mt-2 text-sm text-brand-700">
              {t('languagesSpoken')}:{' '}
              {(provider.languages ?? [])
                .map((l) => localeNames[l as Locale] ?? l)
                .join(', ')}
            </p>
          ) : null}
          {portfolio.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-base font-bold text-brand-900">{tp('portfolioPastWork')}</h3>
              <ul className="mt-2 grid grid-cols-3 gap-2">
                {portfolio.map((item) => (
                  <li key={item.id} className="overflow-hidden rounded-2xl border border-brand-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.photo_url}
                      alt={item.caption || tp('portfolioPhotoAlt')}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                    {item.caption ? (
                      <p className="truncate px-2 py-1 text-xs text-brand-700">{item.caption}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/* Provider Connect (layout L1) — Path A: the provider's own
              live link/contact. Zervia takes no booking or payment. */}
          <div className="mt-5 rounded-2xl border-2 border-brand-200 bg-brand-50 p-4">
            <h3 className="text-lg font-bold text-brand-900">{tconn('connectTitle')}</h3>
            <p className="mt-1 text-sm text-brand-700">{tconn('connectText')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {provider.external_booking_url && showExternalContact ? (
                <a
                  href={provider.external_booking_url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700"
                >
                  {tconn('connectCta')}
                </a>
              ) : null}
              {provider.phone && showExternalContact ? (
                <a
                  href={`tel:${provider.phone.replace(/[^0-9+]/g, '')}`}
                  className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700 hover:border-brand-400"
                >
                  {t('callProvider')}
                </a>
              ) : null}
              {whatsappHref && showExternalContact ? (
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
            {isCommunity && !hasExchanged ? (
              <p className="mt-3 text-sm font-semibold text-brand-800">{tcomm('firstContactNote')}</p>
            ) : !provider.external_booking_url && !provider.phone && !whatsappHref ? (
              <p className="mt-3 text-sm font-semibold text-brand-800">{tconn('connectNoLink')}</p>
            ) : !provider.external_booking_url ? (
              <p className="mt-3 text-xs text-brand-600">{tconn('connectNoLinkText')}</p>
            ) : null}
            <p className="mt-3 text-xs text-brand-600">{tconn('cancelNote')}</p>
            <div className="mt-3">
              <AffiliateNote locale={locale} variant="prominent" />
            </div>
          </div>
        </Panel>
      ) : null}

      {/* Path B — Ask Zervia to match me (no booking, no payment).
          For Community providers the disclaimer + safety checklist
          gate (§3b) must be acknowledged before the form can be sent,
          and the first exchange happens here, inside Zervia (§7b). */}
      {provider ? (
        <Panel>
          <h2 className="text-xl font-bold text-brand-900">{tconn('matchTitle')}</h2>
          <p className="mt-1 text-sm text-brand-700">{tconn('matchIntro')}</p>
          <div className="mt-4">
            {viewer ? (
              isCommunity ? (
                <PreContactGate providerId={provider.id}>
                  <MatchRequestForm
                    listingTitle={data.title}
                    providerName={provider.business_name}
                  />
                </PreContactGate>
              ) : (
                <MatchRequestForm
                  listingTitle={data.title}
                  providerName={provider.business_name}
                />
              )
            ) : (
              /* V2 public browse (Kijiji pattern): signup is required at the
                 transaction point. Anonymous visitors get a sign-in CTA that
                 returns them to this listing after sign-in. */
              <Link
                href={`${localizedPath('/login', locale)}?next=${encodeURIComponent(
                  localizedPath(`/listings/${id}`, locale)
                )}`}
                className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700"
              >
                {tAuth('signInLink')}
              </Link>
            )}
          </div>
        </Panel>
      ) : null}

      {/* Community feedback (Community tier only) — labelled as
          community feedback, never as verified-booking reviews. */}
      {isCommunity ? (
        <Panel>
          <h2 className="text-xl font-bold text-brand-900">{tcomm('feedbackTitle')}</h2>
          <p className="mt-1 text-xs text-brand-500">{tcomm('feedbackIntro')}</p>
          {communityFeedback.length === 0 ? (
            <p className="mt-2 text-base text-brand-700">{tb('noReviews')}</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {communityFeedback.map((f) => (
                <li key={f.id} className="border-t border-brand-100 pt-3">
                  <p className="text-base font-bold text-brand-900" aria-label={tb('stars', { count: f.rating })}>
                    <span aria-hidden="true">{'⭐'.repeat(f.rating)}</span>
                  </p>
                  {f.text ? (
                    <p className="mt-1 whitespace-pre-wrap text-base text-brand-800">{f.text}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-brand-500">
                    {new Date(f.created_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            {viewer ? (
              <CommunityFeedbackForm providerId={provider?.id ?? ''} />
            ) : (
              <p className="text-sm text-brand-600">{tcomm('feedbackSignIn')}</p>
            )}
          </div>
        </Panel>
      ) : null}

      {/* Public reviews for this provider */}
      {!isCommunity ? (
      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{tb('reviewsTitle')}</h2>
        <p className="mt-1 text-xs text-brand-500">{tconn('reviewsLabel')}</p>        {!reviews || reviews.length === 0 ? (
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
                {(r.photo_urls ?? []).length > 0 ? (
                  <ul className="mt-2 grid grid-cols-3 gap-2">
                    {(r.photo_urls ?? []).slice(0, 3).map((url) => (
                      <li key={url} className="overflow-hidden rounded-xl border border-brand-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={tb('reviewPhotoAlt')}
                          className="aspect-square w-full object-cover"
                          loading="lazy"
                        />
                      </li>
                    ))}
                  </ul>
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

      ) : null}

      {/* Trust: report this listing if something looks wrong.
          Community listings also get Block (personal hide). */}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <ReportButton
          listingId={data.id}
          providerId={provider?.id}
          signedIn={Boolean(viewer)}
        />
        {isCommunity && viewer && provider ? (
          <BlockButton providerId={provider.id} />
        ) : null}
      </div>
    </div>
  );
}
