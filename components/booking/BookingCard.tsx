import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

const CHIP: Record<BookingStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-brand-100 text-brand-800',
  in_progress: 'bg-sky-100 text-sky-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
  disputed: 'bg-red-100 text-red-800',
};

/** Coloured status pill. Label is translated by the caller. */
export function StatusChip({
  status,
  label,
}: {
  status: BookingStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold ${CHIP[status] ?? CHIP.pending}`}
    >
      {label}
    </span>
  );
}

export type BookingCardItem = {
  id: string;
  scheduled_at: string | null;
  status: BookingStatus;
  created_at: string;
  listings: { id: string; title: string } | null;
  /** Customer view: who provides it. Provider view: who requested it. */
  counterparty: string | null;
};

/** One booking row linking to its detail page, with optional one-tap rebook. */
export function BookingCard({
  booking,
  statusLabel,
  scheduledText,
  rebookLabel,
}: {
  booking: BookingCardItem;
  statusLabel: string;
  scheduledText: string;
  /** Shown for completed bookings: one-tap rebook (anti-disintermediation). */
  rebookLabel?: string;
}) {
  const canRebook =
    rebookLabel && booking.status === 'completed' && booking.listings?.id;
  return (
    <div>
      <Link href={`/app/bookings/${booking.id}`} className="block">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-lg font-bold text-brand-900">
              {booking.listings?.title ?? '—'}
            </p>
            <StatusChip status={booking.status} label={statusLabel} />
          </div>
          {booking.counterparty ? (
            <p className="mt-1 text-sm font-semibold text-brand-700">
              {booking.counterparty}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-brand-500">{scheduledText}</p>
        </Panel>
      </Link>
      {canRebook ? (
        <Link
          href={`/listings/${booking.listings!.id}/book/new`}
          className="mt-2 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
        >
          <span aria-hidden="true">↻</span> {rebookLabel}
        </Link>
      ) : null}
    </div>
  );
}
