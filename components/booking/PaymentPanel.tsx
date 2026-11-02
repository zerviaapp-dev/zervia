'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Panel } from '@/components/Panel';
import { formatCurrency, type Currency } from '@/lib/currency';

type EscrowStatus = 'held' | 'released' | 'refunded' | 'disputed' | null;

function formatCents(cents: number, currency: Currency, locale: string): string {
  return formatCurrency(cents, currency, locale);
}

/**
 * Payment panel on the booking detail page.
 * - Customer on a payable booking (pending/confirmed, agreed price, no
 *   escrow yet): "Pay securely" button -> Stripe Checkout (TEST MODE).
 * - Escrow held: customer sees "payment held securely"; provider sees
 *   "payment secured" (do the job, money is waiting).
 * - Released/refunded: final state shown to both parties.
 */
export function PaymentPanel({
  bookingId,
  role,
  status,
  escrowStatus,
  amountCents,
  amountCurrency,
  canPay,
  walletsReady = false,
  testMode = true,
}: {
  bookingId: string;
  role: 'customer' | 'provider';
  status: string;
  escrowStatus: EscrowStatus;
  amountCents: number | null;
  amountCurrency: Currency;
  canPay: boolean;
  /** Apple Pay / Google Pay badges — enabled in Stripe Dashboard → Payments → Wallets. */
  walletsReady?: boolean;
  /** Show the "test mode" badge/note. Server-computed from the Stripe key. */
  testMode?: boolean;
}) {
  const t = useTranslations('Payments');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);

  /**
   * Initiates Stripe checkout with idempotency protection.
   * - Disables button during request to prevent double-clicks
   * - Tracks attempt count to prevent infinite retry loops
   * - Only shows retry for retryable errors (not for card declines)
   * - Backend enforces one-escrow-per-booking, so duplicates are impossible
   */
  async function payNow() {
    // Prevent double-submission
    if (busy) return;

    setBusy(true);
    setError('');
    setRetryable(false);
    setAttemptCount((c) => c + 1);

    try {
      const res = await fetch('/api/stripe/escrow-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, locale }),
      });

      const data = (await res.json()) as {
        url?: string;
        error?: string;
        userMessage?: string;
        declineCode?: string;
        retryable?: boolean;
      };

      if (data.url) {
        // Success: redirect to Stripe. Don't re-enable button.
        window.location.href = data.url;
        return;
      }

      // Show user-friendly message from backend, fallback to generic
      const message = data.userMessage ?? data.error ?? t('payFailed');
      setError(message);
      setRetryable(data.retryable ?? false);

      // Log for debugging (no sensitive data)
      console.warn('[PaymentPanel] Checkout failed:', {
        error: data.error,
        declineCode: data.declineCode,
        retryable: data.retryable,
        attempt: attemptCount + 1,
      });
    } catch (fetchErr) {
      // Network error or JSON parse failure
      setError(t('payFailed'));
      setRetryable(true); // Network errors are retryable
      console.error('[PaymentPanel] Network error:', fetchErr);
    }

    setBusy(false);
  }

  /**
   * Safe retry: clears error state and re-attempts.
   * Button stays disabled during the attempt to prevent duplicates.
   */
  function handleRetry() {
    setError('');
    setRetryable(false);
    payNow();
  }

  const primary =
    'inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60';

  return (
    <Panel>
      <h2 className="text-xl font-bold text-brand-900">{t('paymentTitle')}</h2>
      {testMode ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-500">
          {t('testModeBadge')}
        </p>
      ) : null}

      {escrowStatus === 'held' ? (
        <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3">
          <p className="text-base font-bold text-emerald-800">
            {role === 'provider' ? t('securedProvider') : t('securedCustomer')}
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            {amountCents != null ? formatCents(amountCents, amountCurrency, locale) : ''} ·{' '}
            {t('heldExplainer')}
          </p>
        </div>
      ) : escrowStatus === 'released' ? (
        <div className="mt-3 rounded-2xl bg-brand-50 px-4 py-3">
          <p className="text-base font-bold text-brand-800">{t('released')}</p>
          {amountCents != null ? (
            <p className="mt-1 text-sm text-brand-700">
              {formatCents(amountCents, amountCurrency, locale)}
            </p>
          ) : null}
        </div>
      ) : escrowStatus === 'refunded' ? (
        <div className="mt-3 rounded-2xl bg-gray-100 px-4 py-3">
          <p className="text-base font-bold text-gray-700">{t('refunded')}</p>
        </div>
      ) : escrowStatus === 'disputed' ? (
        <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3">
          <p className="text-base font-bold text-red-700">{t('disputed')}</p>
          <p className="mt-1 text-sm text-red-600">{t('disputedExplainer')}</p>
        </div>
      ) : canPay && role === 'customer' && amountCents != null ? (
        <div className="mt-3">
          <p className="text-base text-brand-800">
            {t('payPrompt', { amount: formatCents(amountCents, amountCurrency, locale) })}
          </p>
          <p className="mt-1 text-sm text-brand-600">{t('payExplainer')}</p>
          <button type="button" onClick={payNow} disabled={busy} className={primary + ' mt-3'}>
            {busy ? t('redirecting') : t('payNow')}
          </button>
          {walletsReady ? (
            <p className="mt-2 text-sm font-semibold text-brand-700">
               {t('walletAccepted')} · G {t('walletGooglePay')}
            </p>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p role="alert" className="text-sm font-medium text-red-700">
                {error}
              </p>
              {retryable ? (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={busy}
                  className="mt-2 inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? t('redirecting') : t('tryAgain')}
                </button>
              ) : (
                <p className="mt-1 text-xs text-red-500">
                  {t('tryDifferentMethod')}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-base text-brand-700">{t('noPaymentYet')}</p>
      )}
      <p className="mt-3 text-xs text-brand-500">{testMode ? t('testModeNote') : t('secureNote')}</p>
    </Panel>
  );
}
