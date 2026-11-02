'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { submitPostServiceSurvey } from '@/lib/supabase/survey-actions';
import type { ActionResult } from '@/lib/supabase/actions';
import { Field } from '@/components/auth/Field';
import { SubmitButton } from '@/components/auth/SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * REQUIRED post-service survey (CEO decision, Oct 2026): after a service
 * is completed, the customer must rate the overall experience plus quality,
 * punctuality, and communication (1–5 each), say whether they'd recommend
 * the provider, and may leave comments. One survey per booking is enforced
 * by the DB unique constraint on post_service_surveys.booking_id AND
 * checked server-side before insert.
 */
export function PostServiceSurvey({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings');
  const locale = useLocale();
  const [state, formAction] = useActionState(submitPostServiceSurvey, initialState);
  const [rating, setRating] = useState(0);
  const [quality, setQuality] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState('');

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />
      <input type="hidden" name="quality" value={quality} />
      <input type="hidden" name="punctuality" value={punctuality} />
      <input type="hidden" name="communication" value={communication} />
      <input type="hidden" name="wouldRecommend" value={wouldRecommend} />

      {state.message ? (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.message}
        </p>
      ) : null}

      <Field label={t('ratingLabel')} htmlFor="survey-rating-5">
        <div className="flex gap-2" role="radiogroup" aria-label={t('ratingLabel')}>
          {[5, 4, 3, 2, 1].map((n) => (
            <button
              key={n}
              id={n === 5 ? 'survey-rating-5' : undefined}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} / 5`}
              onClick={() => setRating(n)}
              className={`flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl text-3xl transition-colors ${
                rating >= n ? 'bg-amber-100' : 'bg-brand-50 hover:bg-brand-100'
              }`}
            >
              <span aria-hidden="true" className={rating >= n ? '' : 'grayscale opacity-40'}>
                ⭐
              </span>
            </button>
          ))}
        </div>
      </Field>

      <ScorePicker
        label={t('qualityLabel')}
        name="quality"
        value={quality}
        onChange={setQuality}
      />
      <ScorePicker
        label={t('punctualityLabel')}
        name="punctuality"
        value={punctuality}
        onChange={setPunctuality}
      />
      <ScorePicker
        label={t('communicationLabel')}
        name="communication"
        value={communication}
        onChange={setCommunication}
      />

      <Field label={t('wouldRecommendLabel')} htmlFor="survey-recommend-yes">
        <div className="flex gap-3" role="radiogroup" aria-label={t('wouldRecommendLabel')}>
          <button
            id="survey-recommend-yes"
            type="button"
            role="radio"
            aria-checked={wouldRecommend === 'yes'}
            onClick={() => setWouldRecommend('yes')}
            className={`inline-flex min-h-[56px] flex-1 items-center justify-center rounded-2xl text-base font-semibold transition-colors ${
              wouldRecommend === 'yes'
                ? 'bg-brand-600 text-white'
                : 'bg-brand-50 text-brand-900 hover:bg-brand-100'
            }`}
          >
            👍 {t('yes')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={wouldRecommend === 'no'}
            onClick={() => setWouldRecommend('no')}
            className={`inline-flex min-h-[56px] flex-1 items-center justify-center rounded-2xl text-base font-semibold transition-colors ${
              wouldRecommend === 'no'
                ? 'bg-brand-600 text-white'
                : 'bg-brand-50 text-brand-900 hover:bg-brand-100'
            }`}
          >
            👎 {t('no')}
          </button>
        </div>
      </Field>

      <Field label={t('commentsLabel')} htmlFor="survey-comments">
        <textarea
          id="survey-comments"
          name="comments"
          rows={4}
          maxLength={2000}
          placeholder={t('commentsPlaceholder')}
          className="auth-input"
        />
      </Field>

      <SubmitButton>{t('submitSurvey')}</SubmitButton>
    </form>
  );
}

/** Compact 1–5 score picker for quality / punctuality / communication. */
function ScorePicker({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label} htmlFor={`${name}-1`}>
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            id={n === 1 ? `${name}-1` : undefined}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${label}: ${n} / 5`}
            onClick={() => onChange(n)}
            className={`flex min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl text-lg font-bold transition-colors ${
              value === n
                ? 'bg-brand-600 text-white'
                : 'bg-brand-50 text-brand-900 hover:bg-brand-100'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </Field>
  );
}
