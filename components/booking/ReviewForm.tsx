'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { submitReview, type ActionResult } from '@/lib/supabase/booking-actions';
import { Field } from '@/components/auth/Field';
import { SubmitButton } from '@/components/auth/SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * Review form: 1–5 star picker (big tap targets) + optional text.
 * One review per booking is enforced by the DB unique constraint on
 * reviews.booking_id AND checked server-side before insert.
 */
export function ReviewForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings');
  const locale = useLocale();
  const [state, formAction] = useActionState(submitReview, initialState);
  const [rating, setRating] = useState(0);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />

      {state.message ? (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.message}
        </p>
      ) : null}

      <Field label={t('ratingLabel')} htmlFor="rating-5">
        <div className="flex gap-2" role="radiogroup" aria-label={t('ratingLabel')}>
          {[5, 4, 3, 2, 1].map((n) => (
            <button
              key={n}
              id={n === 5 ? 'rating-5' : undefined}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} / 5`}
              onClick={() => setRating(n)}
              className={`flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl text-3xl transition-colors ${
                rating >= n
                  ? 'bg-amber-100'
                  : 'bg-brand-50 hover:bg-brand-100'
              }`}
            >
              <span aria-hidden="true" className={rating >= n ? '' : 'grayscale opacity-40'}>
                ⭐
              </span>
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('reviewTextLabel')} htmlFor="text">
        <textarea
          id="text"
          name="text"
          rows={4}
          maxLength={2000}
          placeholder={t('reviewTextPlaceholder')}
          className="auth-input"
        />
      </Field>

      <SubmitButton>{t('reviewSubmit')}</SubmitButton>
    </form>
  );
}
