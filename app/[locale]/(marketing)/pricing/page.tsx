import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/Button';
import { isStripeConfigured } from '@/lib/stripe';
import {
  PRO_MONTHLY_CENTS,
  PRO_YEARLY_CENTS,
  BUSINESS_MONTHLY_CENTS,
  BUSINESS_YEARLY_CENTS,
  BOOST_CENTS,
  formatPrice,
  isTestMode,
} from '@/lib/pricing';
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
 * "Choose" buttons deep-link into signup; the actual purchase happens
 * from the provider billing dashboard after login (Stripe Checkout).
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

  const other = yearly ? '' : '?interval=year';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-center text-3xl font-bold text-brand-900">{t('pricingTitle')}</h1>
      <p className="mt-2 text-center text-lg text-brand-700">{t('pricingSubtitle')}</p>
      {isStripeConfigured() && isTestMode() ? (
        <p className="mx-auto mt-4 w-fit rounded-full bg-amber-100 px-4 py-1 text-sm font-semibold text-amber-800">
          {t('testMode')}
        </p>
      ) : null}

      <div className="mt-6 flex justify-center gap-2" role="group" aria-label="billing interval">
        <Link
          href={`/pricing${other}`}
          className={`rounded-full px-6 py-3 text-base font-semibold ${
            !yearly ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 border-2 border-brand-200'
          }`}
          aria-current={!yearly}
        >
          {t('monthly')}
        </Link>
        <Link
          href={`/pricing${yearly ? '' : '?interval=year'}`}
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
              <ul className="mt-4 space-y-2 text-base text-brand-800">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden="true" className="text-brand-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Button
                  href={localizedPath(tier.key === 'starter' ? '/signup' : '/app/billing', locale)}
                  variant={tier.popular ? 'primary' : 'secondary'}
                >
                  {tier.key === 'starter' ? t('ctaChoose', { tier: t(tier.nameKey) }) : t('upgradeCta')}
                </Button>
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
      </Panel>

      <p className="mt-6 text-center text-sm text-brand-600">
        <Link href={localizedPath('/app/billing', locale)} className="underline">
          {t('billingTitle')}
        </Link>
      </p>
    </div>
  );
}
