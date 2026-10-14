'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { requestBooking} from '@/lib/supabase/booking-actions';
import type { ActionResult } from '@/lib/supabase/actions';
import { Field } from '@/components/auth/Field';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { SlotPicker } from '@/components/booking/SlotPicker';
import type { DaySlots } from '@/lib/supabase/slots';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * Booking request form: pick an open slot from the provider's availability
 * calendar (when set), or enter a date/time manually — plus notes for the
 * provider. Posts to requestBooking; server re-validates everything
 * (future date, slot availability, own-listing block).
 */
export function BookingRequestForm({
  listingId,
  slots,
  defaultNotes,
}: {
  listingId: string;
  slots?: DaySlots[];
  defaultNotes?: string;
}) {
  const t = useTranslations('Bookings');
  const locale = useLocale();
  const [state, formAction] = useActionState(requestBooking, initialState);
  const [manual, setManual] = useState(false);
  const [pickedDate, setPickedDate] = useState('');
  const [pickedTime, setPickedTime] = useState('');

  const hasSlots = !!slots && slots.length > 0;
  const showPicker = hasSlots && !manual;

  const today = new Date().toISOString().slice(0, 10);

  function onSlotSelect(date: string, time: string) {
    setPickedDate(date);
    setPickedTime(time);
  }

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

      {showPicker ? (
        <>
          <SlotPicker
            days={slots ?? []}
            selectedDate={pickedDate}
            selectedTime={pickedTime}
            onSelect={onSlotSelect}
          />
          <input type="hidden" name="scheduledDate" value={pickedDate} />
          <input type="hidden" name="scheduledTime" value={pickedTime} />
          {pickedDate && pickedTime ? (
            <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
              ✓ {pickedDate} · {pickedTime}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-sm font-semibold text-brand-700 underline"
          >
            {t('enterManually')}
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label={t('dateLabel')} htmlFor="scheduledDate">
              <input
                id="scheduledDate"
                name="scheduledDate"
                type="date"
                min={today}
                defaultValue={pickedDate}
                key={`d-${manual}`}
                className="auth-input"
              />
            </Field>
            <Field label={t('timeLabel')} htmlFor="scheduledTime">
              <input
                id="scheduledTime"
                name="scheduledTime"
                type="time"
                defaultValue={pickedTime}
                key={`t-${manual}`}
                className="auth-input"
              />
            </Field>
          </div>
          <p className="-mt-2 text-sm text-brand-500">{t('flexible')}</p>
          {hasSlots ? (
            <button
              type="button"
              onClick={() => setManual(false)}
              className="text-sm font-semibold text-brand-700 underline"
            >
              {t('pickSlot')}
            </button>
          ) : null}
        </>
      )}

      <Field label={t('notesLabel')} htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          placeholder={t('notesPlaceholder')}
          defaultValue={defaultNotes ?? ''}
          className="auth-input"
        />
      </Field>

      <SubmitButton>{t('submitRequest')}</SubmitButton>
    </form>
  );
}
