'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { requestBooking, type ActionResult } from '@/lib/supabase/booking-actions';
import { Field } from '@/components/auth/Field';
import { SubmitButton } from '@/components/auth/SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * Booking request form: preferred date/time (optional — flexible is fine)
 * plus notes for the provider. Posts to requestBooking; server re-validates
 * everything (future date, slot availability, own-listing block).
 */
export function BookingRequestForm({ listingId }: { listingId: string }) {
  const t = useTranslations('Bookings');
  const locale = useLocale();
  const [state, formAction] = useActionState(requestBooking, initialState);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="listingId" value={listingId} />

      {state.message ? (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t('dateLabel')} htmlFor="scheduledDate">
          <input
            id="scheduledDate"
            name="scheduledDate"
            type="date"
            min={today}
            className="auth-input"
          />
        </Field>
        <Field label={t('timeLabel')} htmlFor="scheduledTime">
          <input
            id="scheduledTime"
            name="scheduledTime"
            type="time"
            className="auth-input"
          />
        </Field>
      </div>
      <p className="-mt-2 text-sm text-brand-500">{t('flexible')}</p>

      <Field label={t('notesLabel')} htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          placeholder={t('notesPlaceholder')}
          className="auth-input"
        />
      </Field>

      <SubmitButton>{t('submitRequest')}</SubmitButton>
    </form>
  );
}
