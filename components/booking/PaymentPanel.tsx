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
}: {
  bookingId: string;
  role: 'customer' | 'provider';
  status: string;
  escrowStatus: EscrowStatus;
  amountCents: number | null;
  amountCurrency: Currency;
  canPay: boolean;
}) {
  const t = useTranslations('Payments');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function payNow() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/escrow-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, locale }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? t('payFailed'));
    } catch {
      setError(t('payFailed'));
    }
    setBusy(false);
  }

  const primary =
    'inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60';

  return (
    <Panel>
      <h2 className="text-xl font-bold text-brand-900">{t('paymentTitle')}</h2>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-500">
        {t('testModeBadge')}
      </p>

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
          {error ? (
            <p role="alert" className="mt-2 text-sm font-medium text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-base text-brand-700">{t('noPaymentYet')}</p>
      )}
      <p className="mt-3 text-xs text-brand-500">{t('testModeNote')}</p>
    </Panel>
  );
}
