'use client';

import { useLocale, useTranslations } from 'next-intl';
import { setBookingStatus } from '@/lib/supabase/booking-actions';

/**
 * Action buttons on the booking detail page. Rendered conditionally by the
 * server page based on the viewer's role and the booking status:
 *  - customer + pending: Cancel
 *  - provider + pending: Confirm / Decline
 *  - provider + confirmed: Start job (→ in_progress) / Cancel
 *  - provider + in_progress: Mark completed
 * Destructive actions ask for confirmation first. Each is a plain form
 * posting to the setBookingStatus server action.
 */
export function BookingActions({
  bookingId,
  role,
  status,
  releaseAmount,
  releaseCurrency,
}: {
  bookingId: string;
  role: 'customer' | 'provider';
  status: string;
  /** Amount (in cents) that will be released on completion — shown in the confirm dialog. */
  releaseAmount?: number | null;
  /** Currency code for the release amount (e.g. 'cad'). */
  releaseCurrency?: string | null;
}) {
  const t = useTranslations('Bookings');
  const locale = useLocale();

  const primary =
    'inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700';
  const danger =
    'inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-red-200 bg-white px-8 text-base font-semibold text-red-700 hover:border-red-400';
  const subtle =
    'inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-8 text-base font-semibold text-brand-700 hover:border-brand-400';

  function StatusForm({
    target,
    label,
    className,
    confirmMessage,
  }: {
    target: 'confirmed' | 'in_progress' | 'cancelled' | 'completed';
    label: string;
    className: string;
    confirmMessage?: string;
  }) {
    return (
      <form
        action={setBookingStatus}
        onSubmit={(e) => {
          if (confirmMessage && !window.confirm(confirmMessage))
            e.preventDefault();
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={bookingId} />
        <input type="hidden" name="status" value={target} />
        <button type="submit" className={className}>
          {label}
        </button>
      </form>
    );
  }

  // Money-aware completion confirmation: show the exact amount being
  // released so the provider understands the financial consequence.
  const releaseLabel =
    releaseAmount != null && releaseAmount > 0
      ? new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: (releaseCurrency ?? 'cad').toUpperCase(),
        }).format(releaseAmount / 100)
      : null;
  const completeConfirmMessage = releaseLabel
    ? t('completeConfirmWithAmount', { amount: releaseLabel })
    : t('completeConfirm');
  // Cancel confirmation: tell the customer their money comes back.
  const cancelConfirmMessage = releaseLabel
    ? t('cancelConfirmWithRefund', { amount: releaseLabel })
    : t('cancelConfirm');

  return (
    <div className="flex flex-wrap gap-3">
      {role === 'customer' &&
      ['pending', 'confirmed', 'in_progress'].includes(status) ? (
        <StatusForm
          target="cancelled"
          label={t('cancelBooking')}
          className={danger}
          confirmMessage={cancelConfirmMessage}
        />
      ) : null}
      {role === 'provider' && status === 'pending' ? (
        <>
          <StatusForm
            target="confirmed"
            label={t('confirmBooking')}
            className={primary}
          />
          <StatusForm
            target="cancelled"
            label={t('declineBooking')}
            className={danger}
            confirmMessage={cancelConfirmMessage}
          />
        </>
      ) : null}
      {role === 'provider' && status === 'confirmed' ? (
        <>
          <StatusForm
            target="in_progress"
            label={t('startJob')}
            className={primary}
          />
          <StatusForm
            target="cancelled"
            label={t('cancelBooking')}
            className={danger}
            confirmMessage={cancelConfirmMessage}
          />
        </>
      ) : null}
      {role === 'provider' && status === 'in_progress' ? (
        <>
          <StatusForm
            target="completed"
            label={t('markCompleted')}
            className={subtle}
            confirmMessage={completeConfirmMessage}
          />
          <StatusForm
            target="cancelled"
            label={t('cancelBooking')}
            className={danger}
            confirmMessage={cancelConfirmMessage}
          />
        </>
      ) : null}
    </div>
  );
}
