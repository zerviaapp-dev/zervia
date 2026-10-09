import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/Button';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { PortalButton } from '@/components/billing/PortalButton';
import { BoostPurchase, type BoostListing } from '@/components/billing/BoostPurchase';
import { OneTimePurchases } from '@/components/billing/OneTimePurchases';
import { createClient } from '@/lib/supabase/server';
import { isStripeConfigured } from '@/lib/stripe';
import {
  getMyProvider,
  getSubscription,
  getTransactions,
  getLeadFeesAccrued,
} from '@/lib/supabase/billing-actions';
import { localizedPath } from '@/lib/locale-path';
import {
  BOOST_CENTS,
  PRO_MONTHLY_CENTS,
  PRO_YEARLY_CENTS,
  BUSINESS_MONTHLY_CENTS,
  BUSINESS_YEARLY_CENTS,
  VERIFICATION_BADGE_CENTS,
  FEATURED_WEEK_CENTS,
  PROFILE_SPOTLIGHT_CENTS,
  isTestMode,
  type Tier,
} from '@/lib/pricing';
import {
  asCurrency,
  convertCadCents,
  currencyForCountry,
  formatCurrency,
} from '@/lib/currency';

const TYPE_KEYS: Record<string, string> = {
  subscription: 'typeSubscription',
  boost: 'typeBoost',
  lead_fee: 'typeLeadFee',
  refund: 'typeRefund',
  verification_badge: 'typeVerificationBadge',
  featured_week: 'typeFeaturedWeek',
  profile_spotlight: 'typeProfileSpotlight',
};

const STATUS_KEYS: Record<string, string> = {
  succeeded: 'statusSucceeded',
  pending: 'statusPending',
  failed: 'statusFailed',
  refunded: 'statusRefunded',
};

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Provider billing dashboard: current plan, upgrade/downgrade/cancel
 * (via Stripe portal), featured-boost purchase (points or $9), lead-fee
 * transparency, and full payment history.
 */
export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ interval?: string; checkout?: string }>;
}) {
  const { locale } = await params;
  const { interval, checkout } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Billing' });
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

  const provider = await getMyProvider();
  if (!provider) {
    return (
      <Panel className="text-center">
        <h1 className="text-2xl font-bold text-brand-900">{t('notProviderTitle')}</h1>
        <p className="mt-2 text-base text-brand-700">{t('notProviderText')}</p>
        <div className="mt-6">
          <Button href={localizedPath('/app/provider/onboarding', locale)}>{t('notProviderCta')}</Button>
        </div>
      </Panel>
    );
  }

  const [subscription, transactions, leadFees] = await Promise.all([
    getSubscription(),
    getTransactions(50),
    getLeadFeesAccrued(),
  ]);

  const { data: listings } = await supabase
    .from('listings')
    .select('id, title, is_featured, featured_until')
    .eq('provider_id', provider.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const yearly = interval === 'year';
  const stripeReady = isStripeConfigured();
  const testMode = stripeReady && isTestMode();
  // Prices are shown in the provider's own currency (from their profile
  // country). Tier constants are CAD-base; we convert for display.
  const currency = currencyForCountry(provider.country);
  const tier = (subscription?.tier ?? provider.subscription_tier ?? 'starter') as Tier;
  const tierName =
    tier === 'pro' ? t('tierPro') : tier === 'business' ? t('tierBusiness') : t('tierStarter');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">{t('billingTitle')}</h1>

      {testMode ? (
        <p className="w-fit rounded-full bg-amber-100 px-4 py-1 text-sm font-semibold text-amber-800">
          {t('testMode')}
        </p>
      ) : null}

      {checkout === 'success' ? (
        <Panel className="border-2 border-green-500">
          <h2 className="text-lg font-bold text-green-800">{t('checkoutSuccessTitle')}</h2>
          <p className="mt-1 text-base text-green-700">{t('checkoutSuccessText')}</p>
        </Panel>
      ) : null}
      {checkout === 'cancelled' ? (
        <Panel className="border-2 border-brand-200">
          <h2 className="text-lg font-bold text-brand-900">{t('checkoutCancelledTitle')}</h2>
          <p className="mt-1 text-base text-brand-700">{t('checkoutCancelledText')}</p>
        </Panel>
      ) : null}

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">
          {t('currentPlan')}: {tierName}
        </h2>
        {subscription ? (
          <p className="mt-1 text-base text-brand-700">
            {subscription.current_period_end
              ? t('nextRenewal', { date: formatDate(subscription.current_period_end, locale) })
              : t('noRenewal')}
          </p>
        ) : (
          <p className="mt-1 text-base text-brand-700">{t('noRenewal')}</p>
        )}
        {subscription?.status === 'past_due' ? (
          <p className="mt-2 rounded-xl bg-red-50 px-4 py-2 text-base font-semibold text-red-700">
            {t('pastDueWarning')}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          {subscription && stripeReady ? (
            <PortalButton locale={locale} label={t('manageButton')} />
          ) : null}
          <Link
            href={`${localizedPath('/app/billing', locale)}#plans`}
            className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 py-4 text-lg font-semibold text-brand-700"
          >
            {t('upgradeCta')}
          </Link>
        </div>
      </Panel>

      <Panel>
        <h2 id="plans" className="text-lg font-bold text-brand-900">
          {t('pricingTitle')}
        </h2>
        <div className="mt-3 flex gap-2">
          <Link
            href={`${localizedPath('/app/billing', locale)}`}
            className={`rounded-full px-5 py-2 text-base font-semibold ${
              !yearly ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 border-2 border-brand-200'
            }`}
          >
            {t('monthly')}
          </Link>
          <Link
            href={`${localizedPath('/app/billing', locale)}?interval=year`}
            className={`rounded-full px-5 py-2 text-base font-semibold ${
              yearly ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 border-2 border-brand-200'
            }`}
          >
            {t('yearly')} · {t('yearlySave')}
          </Link>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(
            [
              {
                key: 'pro' as const,
                name: t('proName'),
                desc: t('proDesc'),
                cents: yearly ? PRO_YEARLY_CENTS : PRO_MONTHLY_CENTS,
              },
              {
                key: 'business' as const,
                name: t('businessName'),
                desc: t('businessDesc'),
                cents: yearly ? BUSINESS_YEARLY_CENTS : BUSINESS_MONTHLY_CENTS,
              },
            ]
          ).map((plan) => (
            <div key={plan.key} className="rounded-2xl border-2 border-brand-100 p-4">
              <h3 className="text-lg font-bold text-brand-900">{plan.name}</h3>
              <p className="text-sm text-brand-700">{plan.desc}</p>
              <p className="mt-2">
                <span className="text-2xl font-bold text-brand-900">{formatCurrency(convertCadCents(plan.cents, currency), currency, locale)}</span>
                <span className="text-brand-600">{yearly ? t('perYear') : t('perMonth')}</span>
              </p>
              <div className="mt-3">
                {tier === plan.key ? (
                  <span className="inline-flex min-h-[56px] items-center rounded-full bg-brand-100 px-8 text-lg font-semibold text-brand-800">
                    {t('ctaCurrent')}
                  </span>
                ) : stripeReady ? (
                  <CheckoutButton
                    kind="subscription"
                    tier={plan.key}
                    interval={yearly ? 'year' : 'month'}
                    locale={locale}
                    label={t('ctaChoose', { tier: plan.name })}
                    highlight={plan.key === 'pro'}
                  />
                ) : (
                  <span className="text-sm text-brand-600">{t('testMode')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('boostTitle')}</h2>
        <p className="mt-1 text-base text-brand-700">{t('boostText')}</p>
        {/* Trust gate (Phase 5): boost is earned after 10 completed jobs. */}
        {(provider.completed_jobs ?? 0) >= 10 ? (
          <BoostPurchase
            listings={(listings ?? []) as BoostListing[]}
            locale={locale}
            stripeReady={stripeReady}
            boostPriceLabel={formatCurrency(convertCadCents(BOOST_CENTS, currency), currency, locale)}
          />
        ) : (
          <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-base text-brand-800">
            🔒 {t('boostLocked', { count: 10 - (provider.completed_jobs ?? 0) })}
          </p>
        )}
      </Panel>

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('oneTimeTitle')}</h2>
        <p className="mt-1 text-base text-brand-700">{t('oneTimeText')}</p>
        <OneTimePurchases
          listings={(listings ?? []).map((l) => ({ id: l.id, title: l.title }))}
          locale={locale}
          stripeReady={stripeReady}
          badgeOwned={provider.verification_badge ?? false}
          badgePriceLabel={formatCurrency(convertCadCents(VERIFICATION_BADGE_CENTS, currency), currency, locale)}
          featuredWeekPriceLabel={formatCurrency(convertCadCents(FEATURED_WEEK_CENTS, currency), currency, locale)}
          spotlightPriceLabel={formatCurrency(convertCadCents(PROFILE_SPOTLIGHT_CENTS, currency), currency, locale)}
          spotlightActiveUntil={
            provider.spotlight_until
              ? formatDate(provider.spotlight_until, locale)
              : null
          }
        />
      </Panel>

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('leadFeesTitle')}</h2>
        <p className="mt-1 text-base text-brand-700">{t('leadFeesText')}</p>
        <p className="mt-2 text-base text-brand-800">
          {t('leadFeesAccrued')}: <strong>{formatCurrency(convertCadCents(leadFees, currency), currency, locale)}</strong>
        </p>
        <p className="mt-1 text-sm font-semibold text-green-700">{t('leadFeesFree')}</p>
      </Panel>

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('invoicesTitle')}</h2>
        {transactions.length === 0 ? (
          <p className="mt-2 text-base text-brand-700">{t('invoicesEmpty')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="text-sm text-brand-600">
                  <th className="py-2 pr-4 font-semibold">{t('colDate')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('colType')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('colAmount')}</th>
                  <th className="py-2 font-semibold">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-brand-100 text-brand-900">
                    <td className="py-2 pr-4">{formatDate(tx.created_at, locale)}</td>
                    <td className="py-2 pr-4">{t(TYPE_KEYS[tx.type] ?? 'typeSubscription')}</td>
                    <td className="py-2 pr-4 font-semibold">{formatCurrency(tx.amount_cents, asCurrency(tx.currency), locale)}</td>
                    <td className="py-2">{t(STATUS_KEYS[tx.status] ?? 'statusPending')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
