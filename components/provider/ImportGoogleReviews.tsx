'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  findGoogleBusiness,
  importGoogleReviews,
  type ImportedReviewView,
} from '@/lib/supabase/review-import-actions';
import type { GooglePlaceMatch } from '@/lib/google-reviews';
import { Field } from '@/components/auth/Field';

/**
 * Google review import for provider onboarding / dashboard.
 *
 * Flow: provider types their Google Business name (+ optional city) →
 * "Find my business" → matched place card (name + address) → "Yes, import
 * reviews" → server action fetches up to 5 Google reviews and stores them
 * flagged `source = 'google'`. Imported reviews render with a "from Google"
 * badge so customers can tell them apart from native Zervia reviews.
 *
 * The Places API key never leaves the server: both steps go through server
 * actions. Importing requires an existing provider row (auth-checked), so
 * this belongs on the provider dashboard rather than inside onboarding.
 */
export function ImportGoogleReviews({
  defaultBusinessName = '',
  defaultCity = '',
}: {
  defaultBusinessName?: string;
  defaultCity?: string;
}) {
  const t = useTranslations('Provider');
  const locale = useLocale();
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [city, setCity] = useState(defaultCity);
  const [phase, setPhase] = useState<'idle' | 'searching' | 'matched' | 'importing' | 'done'>('idle');
  const [match, setMatch] = useState<GooglePlaceMatch | null>(null);
  const [imported, setImported] = useState<ImportedReviewView[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [errorKey, setErrorKey] = useState('');

  const inputClass =
    'auth-input w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-base text-brand-900 placeholder:text-brand-400 focus:border-brand-600 focus:outline-none';

  async function onFind() {
    setErrorKey('');
    setMatch(null);
    setPhase('searching');
    const res = await findGoogleBusiness(businessName, city);
    if (!res.ok) {
      setErrorKey(res.errorKey);
      setPhase('idle');
      return;
    }
    setMatch(res.place);
    setPhase('matched');
  }

  async function onConfirm() {
    if (!match) return;
    setErrorKey('');
    setPhase('importing');
    const res = await importGoogleReviews(match.placeId, locale);
    if (!res.ok) {
      setErrorKey(res.errorKey);
      setPhase('matched');
      return;
    }
    setImported(res.imported);
    setSkipped(res.skipped);
    setPhase('done');
  }

  function onRetry() {
    setMatch(null);
    setPhase('idle');
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-brand-900">{t('googleReviewsTitle')}</h2>
        <p className="mt-1 text-sm text-brand-700">{t('googleReviewsSubtitle')}</p>
      </div>

      {errorKey ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {t(errorKey)}
        </p>
      ) : null}

      {phase === 'done' ? (
        <div className="space-y-4">
          <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            {t('googleReviewsImportDone', { count: imported.length })}
            {skipped > 0 ? ` ${t('googleReviewsSkipped', { count: skipped })}` : ''}
          </p>
          {imported.length > 0 ? (
            <ul className="space-y-3">
              {imported.map((r, i) => (
                <li key={`${r.authorName}-${i}`} className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-label={`${r.rating} / 5`} className="text-base font-bold text-brand-900">
                      <span aria-hidden="true">{'⭐'.repeat(r.rating)}</span>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                      {t('googleReviewsFromGoogle')}
                    </span>
                    <span className="text-xs text-brand-500">{r.authorName}</span>
                  </div>
                  {r.text ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-brand-800">{r.text}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brand-600 bg-white px-6 text-sm font-semibold text-brand-700"
          >
            {t('googleReviewsImportAnother')}
          </button>
        </div>
      ) : (
        <>
          {(phase === 'idle' || phase === 'searching') && (
            <div className="space-y-4">
              <Field label={t('googleReviewsNameLabel')} htmlFor="google-business-name">
                <input
                  id="google-business-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t('googleReviewsNameHint')}
                  className={inputClass}
                  maxLength={160}
                  autoComplete="organization"
                />
              </Field>
              <Field label={t('googleReviewsCityLabel')} htmlFor="google-business-city">
                <input
                  id="google-business-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t('googleReviewsCityHint')}
                  className={inputClass}
                  maxLength={120}
                  autoComplete="address-level2"
                />
              </Field>
              <button
                type="button"
                onClick={onFind}
                disabled={phase === 'searching' || businessName.trim() === ''}
                className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:w-auto"
              >
                {phase === 'searching' ? t('googleReviewsSearching') : t('googleReviewsFindButton')}
              </button>
            </div>
          )}

          {(phase === 'matched' || phase === 'importing') && match && (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-4">
                <p className="text-sm font-semibold text-brand-700">{t('googleReviewsMatchPrompt')}</p>
                <p className="mt-1 text-base font-bold text-brand-900">{match.name}</p>
                {match.address ? (
                  <p className="mt-0.5 text-sm text-brand-700">{match.address}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={phase === 'importing'}
                  className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {phase === 'importing' ? t('googleReviewsImporting') : t('googleReviewsConfirmButton')}
                </button>
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={phase === 'importing'}
                  className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-lg font-semibold text-brand-700 disabled:opacity-50"
                >
                  {t('googleReviewsTryAgain')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
