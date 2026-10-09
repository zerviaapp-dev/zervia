'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';
import { CheckoutButton } from '@/components/billing/CheckoutButton';

export type OneTimeListing = {
  id: string;
  title: string;
};

/**
 * One-time purchases (no subscription needed):
 *  - Verification Badge ($29): permanent "Verified" badge on the profile.
 *    Requires approved ID verification (checked server-side).
 *  - Featured Week ($15): listing pinned at the top of Discover for 7 days.
 *  - Profile Spotlight ($19): profile highlighted on Discover for 7 days.
 *
 * Each card goes through Stripe Checkout (card path only — no points
 * alternative for these). Amounts come from Stripe Price IDs in env.
 */
export function OneTimePurchases({
  listings,
  locale,
  stripeReady,
  badgeOwned,
  badgePriceLabel,
  featuredWeekPriceLabel,
  spotlightPriceLabel,
  spotlightActiveUntil,
}: {
  listings: OneTimeListing[];
  locale: string;
  stripeReady: boolean;
  badgeOwned: boolean;
  badgePriceLabel: string;
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
      {/* Verification badge */}
      <div className={card}>
        <h3 className="text-lg font-bold text-brand-900">🛡️ {t('oneTimeBadgeName')}</h3>
        <p className="text-sm text-brand-700">{t('oneTimeBadgeDesc')}</p>
        <p className="mt-1">
          <span className="text-2xl font-bold text-brand-900">{badgePriceLabel}</span>
          <span className="text-brand-600"> {t('oneTimeSuffix')}</span>
        </p>
        <div className="mt-auto pt-2">
          {badgeOwned ? (
            <span className="inline-flex min-h-[56px] items-center rounded-full bg-green-100 px-8 text-lg font-semibold text-green-800">
              ✓ {t('oneTimeOwned')}
            </span>
          ) : stripeReady ? (
            <CheckoutButton
              kind="verification_badge"
              locale={locale}
              label={t('oneTimeBuyCta')}
              highlight
            />
          ) : (
            <span className="text-sm text-brand-600">{t('testMode')}</span>
          )}
        </div>
        {!badgeOwned ? (
          <p className="text-xs text-brand-600">{t('oneTimeBadgeNote')}</p>
        ) : null}
      </div>

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
          {stripeReady && listings.length > 0 ? (
            <CheckoutButton
              kind="featured_week"
              listingId={selected}
              locale={locale}
              label={t('oneTimeBuyCta')}
              highlight
            />
          ) : !stripeReady ? (
            <span className="text-sm text-brand-600">{t('testMode')}</span>
          ) : null}
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
          ) : stripeReady ? (
            <CheckoutButton
              kind="profile_spotlight"
              locale={locale}
              label={t('oneTimeBuyCta')}
              highlight
            />
          ) : (
            <span className="text-sm text-brand-600">{t('testMode')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
