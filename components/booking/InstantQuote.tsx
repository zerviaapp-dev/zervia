'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Panel } from '@/components/Panel';
import {
  estimateHourlyRange,
  estimateQuoteRange,
  isJobSize,
  type JobSize,
} from '@/lib/quote-estimates';
import { formatCurrency, type Currency } from '@/lib/currency';

/**
 * Instant price estimate on the listing page, shown before the customer
 * messages the provider. Category-based ballpark logic:
 * - fixed price → nothing to estimate (component renders null)
 * - hourly → hours × rate, ±15%
 * - quote → category typical range × job-size multiplier
 * Always labeled as a rough estimate; the final price is agreed with
 * the provider.
 */
export function InstantQuote({
  category,
  priceCents,
  priceType,
  currency,
}: {
  category: string;
  priceCents: number | null;
  priceType: string;
  currency: Currency;
}) {
  const t = useTranslations('Discover');
  const locale = useLocale();
  const [hours, setHours] = useState(2);
  const [jobSize, setJobSize] = useState<JobSize>('medium');

  if (priceType === 'fixed') return null;

  let range: { low: number; high: number } | null = null;
  if (priceType === 'hourly' && priceCents != null && priceCents > 0) {
    range = estimateHourlyRange(priceCents, hours);
  } else if (priceType === 'quote') {
    range = estimateQuoteRange(category, jobSize, currency);
  }
  if (!range) return null;

  return (
    <Panel>
      <h2 className="text-xl font-bold text-brand-900">
        ⚡ {t('instantQuoteTitle')}
      </h2>
      <p className="mt-1 text-sm text-brand-600">{t('instantQuoteHint')}</p>

      {priceType === 'hourly' ? (
        <div className="mt-4">
          <label
            htmlFor="iq-hours"
            className="text-base font-semibold text-brand-900"
          >
            {t('hoursLabel')}
          </label>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              aria-label="−"
              onClick={() => setHours((h) => Math.max(1, h - 1))}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-brand-200 text-xl font-bold text-brand-700 hover:border-brand-400"
            >
              −
            </button>
            <span
              id="iq-hours"
              className="min-w-[3rem] text-center text-xl font-bold text-brand-900"
              aria-live="polite"
            >
              {hours}
            </span>
            <button
              type="button"
              aria-label="+"
              onClick={() => setHours((h) => Math.min(12, h + 1))}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-brand-200 text-xl font-bold text-brand-700 hover:border-brand-400"
            >
              +
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <span
            id="iq-size-label"
            className="text-base font-semibold text-brand-900"
          >
            {t('jobSizeLabel')}
          </span>
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="radiogroup"
            aria-labelledby="iq-size-label"
          >
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={jobSize === size}
                onClick={() => setJobSize(size)}
                className={`inline-flex min-h-[48px] items-center justify-center rounded-full border-2 px-6 text-base font-semibold transition ${
                  jobSize === size
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-brand-200 bg-white text-brand-800 hover:border-brand-400'
                }`}
              >
                {t(`jobSize${size[0].toUpperCase()}${size.slice(1)}` as 'jobSizeSmall')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-green-50 px-4 py-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-green-700">
          {t('estimatedRange')}
        </p>
        <p className="mt-1 text-2xl font-bold text-green-800">
          {formatCurrency(range.low, currency, locale)} –{' '}
          {formatCurrency(range.high, currency, locale)}
        </p>
      </div>
      <p className="mt-2 text-xs text-brand-500">{t('estimateDisclaimer')}</p>
    </Panel>
  );
}
