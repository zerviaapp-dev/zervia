'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { disputeBooking} from '@/lib/supabase/booking-actions';
import type { ActionResult } from '@/lib/supabase/actions';
import { Field } from '@/components/auth/Field';
import { SubmitButton } from '@/components/auth/SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * Dispute form: the reason is required (10–2000 chars) — the DB trigger
 * rejects a disputed status without one, and the server action validates
 * first for a friendly error.
 */
export function DisputeForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings');
  const locale = useLocale();
  const [state, formAction] = useActionState(disputeBooking, initialState);

  // Toast feedback supplements the inline error card (kept for accessibility).
  const lastToasted = useRef('');
  useEffect(() => {
    if (state.message && state.message !== lastToasted.current) {
      lastToasted.current = state.message;
      if (state.ok) toast.success(state.message);
      else toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={bookingId} />

      {state.message ? (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.message}
        </p>
      ) : null}

      <Field label={t('disputeReasonLabel')} htmlFor="reason">
        <textarea
          id="reason"
          name="reason"
          rows={5}
          required
          minLength={10}
          maxLength={2000}
          placeholder={t('disputeReasonPlaceholder')}
          className="auth-input"
        />
      </Field>

      <SubmitButton>{t('disputeSubmit')}</SubmitButton>
    </form>
  );
}
