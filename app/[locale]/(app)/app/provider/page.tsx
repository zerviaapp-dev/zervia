import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { ListingRowActions } from '@/components/provider/ListingRowActions';
import { TierCard } from '@/components/provider/TierCard';
import { TrustBadge, type TrustLevel } from '@/components/TrustBadge';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countries, type Country } from '@/lib/countries';
import { currencyForCountry, formatListingPrice } from '@/lib/currency';

type ProviderRow = {
  id: string;
  business_name: string;
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  country: string;
  city: string | null;
  trust_level: 'new' | 'verified' | 'trusted' | 'top_rated' | null;
  completed_jobs: number | null;
  rating_avg: number | null;
  review_count: number | null;
  verification_badge: boolean | null;
  spotlight_until: string | null;
};

type ListingRow = {
  id: string;
  title: string;
  category: string;
  price_cents: number | null;
  price_type: string;
  status: string;
  created_at: string;
};

function countryName(code: string, list: Country[]): string {
  return list.find((c) => c.code === code)?.name ?? code;
}

/**
 * Provider dashboard ("My listings"): business status banner, listing CRUD.
 * No provider row yet → points at onboarding. Everything is server-rendered;
 * mutations go through server actions (no client-side data access).
 */
export default async function ProviderDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Provider' });
  const tb = await getTranslations({ locale, namespace: 'Bookings' });
  const tc = await getTranslations({ locale, namespace: 'Categories' });
  const to = await getTranslations({ locale, namespace: 'Offers' });
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

  const { data: provider } = (await supabase
    .from('providers')
    .select(
      'id, business_name, category, status, country, city, trust_level, completed_jobs, rating_avg, review_count, verification_badge, spotlight_until'
    )
    .eq('user_id', user.id)
    .maybeSingle()) as { data: ProviderRow | null };

  if (!provider) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-brand-900">{t('dashboardTitle')}</h1>
        <Panel>
          <p className="text-base text-brand-800">{t('noProviderText')}</p>
          <Link
            href="/app/provider/onboarding"
            className="mt-4 inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
          >
            {t('startOnboarding')}
          </Link>
        </Panel>
      </div>
    );
  }

  const { data: listings } = (await supabase
    .from('listings')
    .select('id, title, category, price_cents, price_type, status, created_at')
    .eq('provider_id', provider.id)
    .neq('status', 'removed') // admin-takedowns stay out of the dashboard
    .order('created_at', { ascending: false })) as { data: ListingRow[] | null };

  const statusBanner =
    provider.status === 'pending' ? (
      <p role="status" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        {t('pendingNote')}
      </p>
    ) : provider.status === 'rejected' ? (
      <p role="status" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        {t('rejectedNote')}
      </p>
    ) : (
      <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
        {t('approvedNote')}
      </p>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-900">{t('dashboardTitle')}</h1>
          <p className="mt-1 text-base text-brand-700">
            {provider.business_name} · {tc(provider.category as 'cleaning')} ·{' '}
            {[provider.city, countryName(provider.country, countries)]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
        <span
          className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-bold ${
            provider.status === 'approved'
              ? 'bg-green-100 text-green-800'
              : provider.status === 'rejected'
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {t(`provider${provider.status[0].toUpperCase()}${provider.status.slice(1)}`)}
        </span>
      </div>

      {statusBanner}

      {/* Growth tier: current level, progress to next, perks. */}
      <TierCard
        trustLevel={provider.trust_level ?? 'new'}
        completedJobs={provider.completed_jobs ?? 0}
      />

      {/* One-time purchases the provider owns. */}
      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('extrasTitle')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {provider.verification_badge ? (
            <span className="inline-flex min-h-[44px] items-center rounded-full bg-green-100 px-4 text-sm font-bold text-green-800">
              🛡️ {t('extrasBadgeOwned')}
            </span>
          ) : (
            <Link
              href="/app/billing"
              className="inline-flex min-h-[44px] items-center rounded-full border-2 border-emerald-600 bg-white px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              🛡️ {t('extrasBadgeCta')}
            </Link>
          )}
          {provider.spotlight_until && new Date(provider.spotlight_until) > new Date() ? (
            <span className="inline-flex min-h-[44px] items-center rounded-full bg-amber-100 px-4 text-sm font-bold text-amber-800">
              🔦 {t('extrasSpotlightActive')}
            </span>
          ) : (
            <Link
              href="/app/billing"
              className="inline-flex min-h-[44px] items-center rounded-full border-2 border-amber-600 bg-white px-4 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              🔦 {t('extrasSpotlightCta')}
            </Link>
          )}
        </div>
      </Panel>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand-900">{t('myListings')}</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/provider/listings/guided"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50"
          >
            ✨ {t('guidedListingCta')}
          </Link>
          <Link
            href="/app/provider/verification"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-emerald-600 bg-white px-6 text-base font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            🛡️ {t('verificationCta')}
          </Link>
          <Link
            href="/app/provider/availability"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-violet-600 bg-white px-6 text-base font-semibold text-violet-700 hover:bg-violet-50"
          >
            📅 {t('availabilityCta')}
          </Link>
          <Link
            href="/app/provider/bookings"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50"
          >
            {tb('bookingRequests')}
          </Link>
          <Link
            href="/app/provider/offers"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-amber-600 bg-white px-6 text-base font-semibold text-amber-700 hover:bg-amber-50"
          >
            🎁 {to('title')}
          </Link>
          <Link
            href="/app/provider/listings/new"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700"
          >
            {t('newListing')}
          </Link>
        </div>
      </div>

      {!listings || listings.length === 0 ? (
        <Panel>
          <p className="text-base text-brand-800">{t('noListings')}</p>
          <p className="mt-2 text-sm text-brand-700">{t('noListingsText')}</p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {listings.map((listing) => (
            <li key={listing.id}>
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-brand-900">{listing.title}</h3>
                    <p className="mt-1 text-sm text-brand-700">
                      {tc(listing.category as 'cleaning')} ·{' '}
                      {formatListingPrice(
                        listing.price_cents,
                        listing.price_type,
                        currencyForCountry(provider.country),
                        currencyForCountry(provider.country),
                        {
                          quote: t('priceQuote'),
                          hourlySuffix: t('perHour'),
                          fixedSuffix: t('perJob'),
                        },
                        locale
                      )}{' '}
                      · {t(`status${listing.status[0].toUpperCase()}${listing.status.slice(1)}`)}
                    </p>
                  </div>
                  <Link
                    href={`/app/provider/listings/${listing.id}/edit`}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-brand-200 px-5 text-sm font-semibold text-brand-700 hover:border-brand-400"
                  >
                    {t('edit')}
                  </Link>
                </div>
                <div className="mt-3">
                  <ListingRowActions listingId={listing.id} status={listing.status} />
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
