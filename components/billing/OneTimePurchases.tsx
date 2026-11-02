'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { PayPalButton } from '@/components/billing/PayPalButton';

export type OneTimeListing = {
  id: string;
  title: string;
};

/**
 * One-time purchases (no subscription needed):
 *  - Featured Week ($15): listing pinned at the top of Discover for 7 days.
 *  - Profile Spotlight ($19): profile highlighted on Discover for 7 days.
 *
 * REMOVED (P0 risk removal, D3/D4 Oct 30 2026): the Verification Badge
 * product — Zervia sells no verification badges, ever.
 *
 * Each card goes through Stripe Checkout (card path only — no points
 * alternative for these). Amounts come from Stripe Price IDs in env.
 */
export function OneTimePurchases({
  listings,
  locale,
  stripeReady,
  paypalReady,
  featuredWeekPriceLabel,
  spotlightPriceLabel,
  spotlightActiveUntil,
}: {
  listings: OneTimeListing[];
  locale: string;
  stripeReady: boolean;
  paypalReady: boolean;
  featuredWeekPriceLabel: string;
  spotlightPriceLabel: string;
  spotlightActiveUntil: string | null;
}) {
  const t = useTranslations('Billing');
  const [selected, setSelected] = useState(listings[0]?.id ?? '');

  const card =
    'rounded-2xl border-2 border-brand-100 p-4 flex flex-col gap-2';

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {/* Featured week */}
      <div className={card}>
        <h3 className="text-lg font-bold text-brand-900">⭐ {t('oneTimeWeekName')}</h3>
        <p className="text-sm text-brand-700">{t('oneTimeWeekDesc')}</p>
        <p className="mt-1">
          <span className="text-2xl font-bold text-brand-900">{featuredWeekPriceLabel}</span>
          <span className="text-brand-600"> {t('oneTimeSuffix')}</span>
        </p>
        {listings.length > 0 ? (
          <label className="mt-1 block">
            <span className="text-sm font-semibold text-brand-800">{t('oneTimeChooseListing')}</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-brand-200 bg-white px-3 py-2 text-base text-brand-900"
            >
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-brand-600">{t('oneTimeNoListings')}</p>
        )}
        <div className="mt-auto pt-2">
          {stripeReady || paypalReady ? (
            listings.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {stripeReady ? (
                  <CheckoutButton
                    kind="featured_week"
                    listingId={selected}
                    locale={locale}
                    label={t('oneTimeBuyCta')}
                    highlight
                  />
                ) : null}
                {paypalReady ? (
                  <PayPalButton
                    kind="featured_week"
                    listingId={selected}
                    locale={locale}
                    label={t('oneTimeBuyPayPalCta')}
                  />
                ) : null}
              </div>
            ) : null
          ) : (
            <span className="text-sm text-brand-600">{t('testMode')}</span>
          )}
        </div>
      </div>

      {/* Profile spotlight */}
      <div className={card}>
        <h3 className="text-lg font-bold text-brand-900">🔦 {t('oneTimeSpotlightName')}</h3>
        <p className="text-sm text-brand-700">{t('oneTimeSpotlightDesc')}</p>
        <p className="mt-1">
          <span className="text-2xl font-bold text-brand-900">{spotlightPriceLabel}</span>
          <span className="text-brand-600"> {t('oneTimeSuffix')}</span>
        </p>
        <div className="mt-auto pt-2">
          {spotlightActiveUntil ? (
            <span className="inline-flex min-h-[56px] items-center rounded-full bg-amber-100 px-8 text-lg font-semibold text-amber-800">
              ✓ {t('oneTimeSpotlightActive', { date: spotlightActiveUntil })}
            </span>
          ) : stripeReady || paypalReady ? (
            <div className="flex flex-wrap gap-2">
              {stripeReady ? (
                <CheckoutButton
                  kind="profile_spotlight"
                  locale={locale}
                  label={t('oneTimeBuyCta')}
                  highlight
                />
              ) : null}
              {paypalReady ? (
                <PayPalButton
                  kind="profile_spotlight"
                  locale={locale}
                  label={t('oneTimeBuyPayPalCta')}
                />
              ) : null}
            </div>
          ) : (
            <span className="text-sm text-brand-600">{t('testMode')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
