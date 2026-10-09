import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { StatusChip } from '@/components/booking/BookingCard';
import { BookingActions } from '@/components/booking/BookingActions';
import { RequestReviewButton } from '@/components/booking/RequestReviewButton';
import { BookingChat, type ChatMessage } from '@/components/booking/BookingChat';
import { QuoteCard, type QuoteRow } from '@/components/booking/QuoteCard';
import { QuoteForm } from '@/components/booking/QuoteForm';
import { PaymentPanel } from '@/components/booking/PaymentPanel';
import { DisputeResolutionPanel } from '@/components/booking/DisputeResolutionPanel';
import { ReworkForm } from '@/components/booking/ReworkForm';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { asCurrency, currencyForCountry, formatCurrency } from '@/lib/currency';

type DetailBooking = {
  id: string;
  listing_id: string;
  customer_id: string;
  provider_id: string;
  scheduled_at: string | null;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
  notes: string | null;
  dispute_reason: string | null;
  review_requested_at: string | null;
  agreed_price_cents: number | null;
  completed_at: string | null;
  rework_requested_at: string | null;
  created_at: string;
  listings: { id: string; title: string; price_cents: number | null; price_type: string } | null;
  providers: { business_name: string; user_id: string; country: string | null } | null;
  customer: { display_name: string } | null;
};

type EscrowInfo = {
  status: 'held' | 'released' | 'refunded' | 'disputed';
  amount_cents: number;
  currency: string | null;
} | null;

type ReviewRow = {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
};

/**
 * Booking detail: status timeline, parties, notes, and role-appropriate
 * actions. One page serves customer, provider, and admin views — the
 * actions shown depend on who is looking and the booking status.
 * RLS is the backstop: if you are not a party (or admin) you see nothing.
 */
export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'Bookings' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizedPath('/login', locale));
  }

  const { data: booking } = (await supabase
    .from('bookings')
    .select(
      'id, listing_id, customer_id, provider_id, scheduled_at, status, notes, dispute_reason, review_requested_at, agreed_price_cents, completed_at, rework_requested_at, created_at, listings(id, title, price_cents, price_type), providers(business_name, user_id, country), customer:profiles!bookings_customer_id_fkey(display_name)'
    )
    .eq('id', id)
    .maybeSingle()) as { data: DetailBooking | null };

  // Not found OR not yours: same response, never a hint it exists.
  if (!booking) {
    notFound();
  }

  const { data: providerRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const isCustomer = booking.customer_id === user.id;
  const isProvider =
    providerRow?.id === booking.provider_id &&
    booking.providers?.user_id === user.id;
  const { data: isAdmin } = await supabase.rpc('is_admin');

  if (!isCustomer && !isProvider && isAdmin !== true) {
    notFound();
  }
  const role: 'customer' | 'provider' = isProvider ? 'provider' : 'customer';

  const { data: review } = (await supabase
    .from('reviews')
    .select('id, rating, text, created_at')
    .eq('booking_id', booking.id)
    .maybeSingle()) as { data: ReviewRow | null };

  // Chat thread + quotes (RLS admits only the parties).
  const { data: messages } = (await supabase
    .from('messages')
    .select('id, body, sender_id, seen_at, created_at')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: true })) as {
    data: ChatMessage[] | null;
  };
  const { data: quotes } = (await supabase
    .from('quotes')
    .select('id, price_cents, scope, proposed_at, status, created_at')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false })) as {
    data: QuoteRow[] | null;
  };

  const counterpartyName =
    role === 'customer'
      ? (booking.providers?.business_name ?? '')
      : (booking.customer?.display_name ?? '');

  const statusKey = {
    pending: 'statusPending',
    confirmed: 'statusConfirmed',
    in_progress: 'statusInProgress',
    completed: 'statusCompleted',
    cancelled: 'statusCancelled',
    disputed: 'statusDisputed',
  } as const;

  const timeline: { key: string; at: string | null; done: boolean }[] = [
    { key: 'timelineRequested', at: booking.created_at, done: true },
    {
      key: 'timelineConfirmed',
      at: null,
      done: ['confirmed', 'in_progress', 'completed'].includes(booking.status),
    },
    {
      key: 'timelineInProgress',
      at: null,
      done: ['in_progress', 'completed'].includes(booking.status),
    },
    { key: 'timelineCompleted', at: null, done: booking.status === 'completed' },
  ];

  const canDispute =
    (isCustomer || isProvider) &&
    ['pending', 'confirmed'].includes(booking.status);
  const canReview =
    isCustomer && booking.status === 'completed' && !review;

  // Escrow payment state (RLS admits the parties; admins see it too).
  const { data: escrow } = (await supabase
    .from('escrow_payments')
    .select('status, amount_cents, currency')
    .eq('booking_id', booking.id)
    .maybeSingle()) as { data: EscrowInfo };

  // Server-truth payable amount: accepted-quote price, else fixed listing price.
  const payableAmount =
    booking.agreed_price_cents ??
    (booking.listings?.price_type === 'fixed'
      ? booking.listings?.price_cents
      : null) ??
    null;
  const canPay =
    isCustomer &&
    ['pending', 'confirmed'].includes(booking.status) &&
    !escrow &&
    payableAmount != null &&
    payableAmount > 0;

  // The agreed price is denominated in the provider's currency (the
  // provider set it in their market). The escrow row carries the Stripe
  // charge currency once a payment exists.
  const priceCurrency = currencyForCountry(booking.providers?.country ?? null);
  const escrowCurrency = asCurrency(escrow?.currency ?? null);

  // 48-hour rework window after completion.
  const completedAtMs = booking.completed_at
    ? new Date(booking.completed_at).getTime()
    : null;  const showRework =
    isCustomer &&
    booking.status === 'completed' &&
    !booking.rework_requested_at &&
    completedAtMs !== null &&
    Date.now() - completedAtMs <= 48 * 60 * 60 * 1000;

  return (
    <div className="space-y-5">
      <Link
        href={role === 'provider' ? '/app/provider/bookings' : '/app/bookings'}
        className="inline-flex min-h-[44px] items-center text-base font-semibold text-brand-700"
      >
        ← {role === 'provider' ? t('bookingRequests') : t('myBookings')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-900">{t('detailTitle')}</h1>
        <StatusChip status={booking.status} label={t(statusKey[booking.status])} />
      </div>

      <Panel>
        <h2 className="text-xl font-bold text-brand-900">
          {booking.listings?.title ?? '—'}
        </h2>
        <dl className="mt-3 space-y-2 text-base">
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-brand-900">{t('providerLabel')}</dt>
            <dd className="text-brand-800">
              {booking.providers?.business_name ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-brand-900">{t('customerLabel')}</dt>
            <dd className="text-brand-800">
              {booking.customer?.display_name ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-brand-900">{t('scheduledFor')}</dt>
            <dd className="text-brand-800">
              {booking.scheduled_at
                ? new Date(booking.scheduled_at).toLocaleString(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : t('scheduledFlexible')}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-brand-900">{t('requestedOn')}</dt>
            <dd className="text-brand-800">
              {new Date(booking.created_at).toLocaleString(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </dd>
          </div>
          {booking.agreed_price_cents !== null ? (
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-brand-900">
                {t('agreedPriceLabel')}
              </dt>
              <dd className="text-lg font-bold text-green-700">
                {formatCurrency(booking.agreed_price_cents, priceCurrency, locale)}
              </dd>
            </div>
          ) : null}
        </dl>
        {booking.notes ? (
          <div className="mt-3">
            <p className="font-semibold text-brand-900">{t('notesTitle')}</p>
            <p className="mt-1 whitespace-pre-wrap text-base text-brand-800">
              {booking.notes}
            </p>
          </div>
        ) : null}
      </Panel>

      {/* Status timeline */}
      <Panel>
        <ol className="space-y-2">
          {timeline.map((step) => (
            <li key={step.key} className="flex items-center gap-3 text-base">
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  step.done
                    ? 'bg-brand-600 text-white'
                    : 'bg-brand-100 text-brand-400'
                }`}
              >
                {step.done ? '✓' : '·'}
              </span>
              <span
                className={
                  step.done
                    ? 'font-semibold text-brand-900'
                    : 'text-brand-400'
                }
              >
                {t(step.key)}
              </span>
            </li>
          ))}
          {booking.status === 'cancelled' ? (
            <li className="flex items-center gap-3 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-600">
                ✕
              </span>
              <span className="font-semibold text-gray-600">
                {t('timelineCancelled')}
              </span>
            </li>
          ) : null}
          {booking.status === 'disputed' ? (
            <li className="flex items-center gap-3 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-200 text-sm font-bold text-red-700">
                !
              </span>
              <span className="font-semibold text-red-700">
                {t('timelineDisputed')}
              </span>
            </li>
          ) : null}
        </ol>
      </Panel>

      {/* Dispute context */}
      {booking.status === 'disputed' && booking.dispute_reason ? (
        <Panel>
          <p className="font-semibold text-brand-900">{t('disputeReason')}</p>
          <p className="mt-1 whitespace-pre-wrap text-base text-brand-800">
            {booking.dispute_reason}
          </p>
        </Panel>
      ) : null}

      {/* Actions */}
      <BookingActions
        bookingId={booking.id}
        role={role}
        status={booking.status}
      />

      {/* Held-payment escrow (TEST MODE) */}
      {(isCustomer || isProvider) ? (
        <PaymentPanel
          bookingId={booking.id}
          role={role}
          status={booking.status}
          escrowStatus={escrow?.status ?? null}
          amountCents={escrow?.amount_cents ?? payableAmount}
          amountCurrency={escrow ? escrowCurrency : priceCurrency}
          canPay={canPay}
        />
      ) : null}

      {/* Admin dispute mediation: release or refund the held payment */}
      {isAdmin === true && booking.status === 'disputed' ? (
        <DisputeResolutionPanel
          bookingId={booking.id}
          escrowStatus={escrow?.status ?? null}
        />
      ) : null}

      {/* 48-hour rework request */}
      {showRework ? <ReworkForm bookingId={booking.id} /> : null}

      {/* Quotes */}
      {quotes && quotes.length > 0 ? (
        <div className="space-y-3">
          {quotes.map((q) => (
            <QuoteCard
              key={q.id}
              quote={q}
              role={role}
              locale={locale}
              currency={priceCurrency}
            />
          ))}
        </div>
      ) : null}

      {/* Provider quote composer (while the job is being arranged). */}
      {role === 'provider' &&
      ['pending', 'confirmed'].includes(booking.status) ? (
        <QuoteForm bookingId={booking.id} />
      ) : null}

      {/* Booking chat thread */}
      {['pending', 'confirmed', 'in_progress', 'completed', 'disputed'].includes(
        booking.status
      ) ? (
        <BookingChat
          bookingId={booking.id}
          initialMessages={messages ?? []}
          currentUserId={user.id}
          counterpartyName={counterpartyName}
        />
      ) : null}

      {canDispute ? (
        <Link
          href={`/app/bookings/${booking.id}/dispute`}
          className="inline-flex min-h-[44px] items-center text-base font-semibold text-red-700 underline"
        >
          {t('disputeTitle')}
        </Link>
      ) : null}

      {/* Review */}
      {canReview ? (
        <Link
          href={`/app/bookings/${booking.id}/review`}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-amber-400 px-8 text-base font-bold text-brand-900 hover:bg-amber-500"
        >
          ⭐ {t('leaveReview')}
        </Link>
      ) : null}
      {/* Provider nudge: ask the customer for a review (one nudge max). */}
      {isProvider &&
      booking.status === 'completed' &&
      !review &&
      !booking.review_requested_at ? (
        <RequestReviewButton bookingId={booking.id} locale={locale} />
      ) : null}
      {isProvider &&
      booking.status === 'completed' &&
      !review &&
      booking.review_requested_at ? (
        <p className="text-base font-medium text-brand-600">
          ✓ {t('reviewRequestSentNote')}
        </p>
      ) : null}
      {review ? (
        <Panel>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">
            {isCustomer ? t('reviewByYou') : t('reviewsTitle')}
          </p>
          <p
            className="mt-1 text-lg font-bold text-brand-900"
            aria-label={t('stars', { count: review.rating })}
          >
            {'⭐'.repeat(review.rating)}
            <span className="sr-only">{t('stars', { count: review.rating })}</span>
          </p>
          {review.text ? (
            <p className="mt-2 whitespace-pre-wrap text-base text-brand-800">
              {review.text}
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
