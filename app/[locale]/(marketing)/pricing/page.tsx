import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/Button';
import {
  PRO_MONTHLY_CENTS,
  PRO_YEARLY_CENTS,
  BUSINESS_MONTHLY_CENTS,
  BUSINESS_YEARLY_CENTS,
  BOOST_CENTS,
  formatPrice,
} from '@/lib/pricing';
import { isBillingLive } from '@/lib/booking-flag';
import { localizedPath } from '@/lib/locale-path';

type TierInfo = {
  key: 'starter' | 'pro' | 'business';
  nameKey: string;
  descKey: string;
  features: string[];
  monthly: number | null;
  yearly: number | null;
  popular?: boolean;
};

/**
 * Public pricing page: Starter free / Pro / Business with a
 * monthly–yearly toggle, plus the $9 / 900-points boost blurb.
 *
 * Stage A (MAJ-2, Oct 20, 2026 — Liz: "both, in sequence"): while
 * BILLING_LIVE is off, this is a FOUNDING page — prices are shown
 * (billing transparency) but nothing can be bought: no TEST MODE
 * banner, no live buy buttons, and honest "billing opens at launch —
 * founding providers are free until then" copy. The Starter CTA still
 * goes to free signup. Stage B flips BILLING_LIVE only after live
 * Stripe is verified end-to-end (charge → cancel → refund).
 */
export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ interval?: string }>;
}) {
  const { locale } = await params;
  const { interval } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Billing' });
  const yearly = interval === 'year';
  const billingLive = isBillingLive();

  const tiers: TierInfo[] = [
    {
      key: 'starter',
      nameKey: 'starterName',
      descKey: 'starterDesc',
      features: [t('starterF1'), t('starterF2'), t('starterF3')],
      monthly: 0,
      yearly: 0,
    },
    {
      key: 'pro',
      nameKey: 'proName',
      descKey: 'proDesc',
      features: [t('proF1'), t('proF2'), t('proF3'), t('proF4')],
      monthly: PRO_MONTHLY_CENTS,
      yearly: PRO_YEARLY_CENTS,
      popular: true,
    },
    {
      key: 'business',
      nameKey: 'businessName',
      descKey: 'businessDesc',
      features: [t('businessF1'), t('businessF2'), t('businessF3'), t('businessF4')],
      monthly: BUSINESS_MONTHLY_CENTS,
      yearly: BUSINESS_YEARLY_CENTS,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-center text-3xl font-bold text-brand-900">{t('pricingTitle')}</h1>
      <p className="mt-2 text-center text-lg text-brand-700">{t('pricingSubtitle')}</p>
      {!billingLive ? (
        <p className="mx-auto mt-4 w-fit rounded-full bg-brand-50 px-4 py-2 text-center text-sm font-semibold text-brand-800">
          {t('foundingNote')}
        </p>
      ) : null}

      <div className="mt-6 flex justify-center gap-2" role="group" aria-label="billing interval">
        {/* Fixed destinations (bug fix Oct 23, 2026): Monthly always
            links to plain /pricing and Yearly always to
            /pricing?interval=year. Previously the Monthly href was
            built from the *other* interval, so both toggles targeted
            the same interval. */}
        <Link
          href="/pricing"
          className={`rounded-full px-6 py-3 text-base font-semibold ${
            !yearly ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 border-2 border-brand-200'
          }`}
          aria-current={!yearly}
        >
          {t('monthly')}
        </Link>
        <Link
          href="/pricing?interval=year"
          className={`rounded-full px-6 py-3 text-base font-semibold ${
            yearly ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 border-2 border-brand-200'
          }`}
          aria-current={yearly}
        >
          {t('yearly')} · {t('yearlySave')}
        </Link>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => {
          const price = yearly ? tier.yearly : tier.monthly;
          return (
            <Panel key={tier.key} className={tier.popular ? 'border-2 border-brand-500 relative' : ''}>
              {tier.popular ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
                  {t('mostPopular')}
                </span>
              ) : null}
              <h2 className="text-xl font-bold text-brand-900">{t(tier.nameKey)}</h2>
              <p className="mt-1 text-sm text-brand-700">{t(tier.descKey)}</p>
              <p className="mt-4">
                <span className="text-3xl font-bold text-brand-900">
                  {price === 0 ? t('starterPrice') : formatPrice(price ?? 0)}
                </span>
                {price !== 0 ? (
                  <span className="text-brand-600">{yearly ? t('perYear') : t('perMonth')}</span>
                ) : null}
              </p>
              {price !== 0 ? (
                <p className="mt-1 text-xs font-semibold text-brand-600">
                  CAD
                </p>
              ) : null}
              <ul className="mt-4 space-y-2 text-base text-brand-800">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden="true" className="text-brand-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {tier.key === 'starter' || billingLive ? (
                  <>
                    <Button
                      href={localizedPath(tier.key === 'starter' ? '/signup' : '/app/billing', locale)}
                      variant={tier.popular ? 'primary' : 'secondary'}
                    >
                      {tier.key === 'starter' ? t('ctaChoose', { tier: t(tier.nameKey) }) : t('upgradeCta')}
                    </Button>
                    {price !== 0 ? (
                      <p className="mt-2 text-xs text-brand-600">
                        {yearly
                          ? t('renewYearly', { amount: (price ?? 0) / 100 })
                          : t('renewMonthly', { amount: (price ?? 0) / 100 })}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    {/* Cleanup Oct 24, 2026 (human simulation): the old
                        "Billing opens at launch" pill was a dead end —
                        no action at all for Pro/Business. Founding
                        period rule still holds: paid tiers cannot be
                        bought yet, no button into test-mode checkout,
                        ever. The honest action is free founding signup
                        (founding providers get Pro features free until
                        billing opens), labelled exactly that way. */}
                    <Button
                      href={localizedPath('/signup?type=provider', locale)}
                      variant="secondary"
                    >
                      {t('foundingTierNote')}
                    </Button>
                    <p className="mt-2 text-xs text-brand-600">{t('ctaBillingSoon')}</p>
                  </>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-8 text-center">
        <h2 className="text-xl font-bold text-brand-900">{t('boostBlurbTitle')}</h2>
        <p className="mt-2 text-base text-brand-700">{t('boostBlurbText')}</p>
        <p className="mt-1 text-sm text-brand-600">
          {t('boostPoints')} · {formatPrice(BOOST_CENTS)}
        </p>
        {/* Z-2 (Oct 23, 2026): while BILLING_LIVE is off the present-tense
            charge terms ("One-time charge of CA$9. No renewal.") are
            suppressed so the page makes ONE promise — nothing is charged
            today. The price and the CAD note stay (billing transparency);
            the terms line returns verbatim when billing opens. */}
        {billingLive ? (
          <p className="mt-1 text-xs text-brand-600">
            {t('oneTime', { amount: BOOST_CENTS / 100 })} {t('currencyNote')}
          </p>
        ) : (
          <p className="mt-1 text-xs text-brand-600">{t('currencyNote')}</p>
        )}
        {!billingLive ? (
          <p className="mt-2 text-sm font-semibold text-brand-700">{t('foundingTierNote')}</p>
        ) : null}
      </Panel>

      <p className="mt-6 text-center text-sm text-brand-600">
        <Link href={localizedPath('/app/billing', locale)} className="underline">
          {t('billingTitle')}
        </Link>
      </p>
    </div>
  );
}
