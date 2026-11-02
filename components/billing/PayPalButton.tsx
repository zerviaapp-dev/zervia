'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';
import type { OneTimeKind } from '@/lib/billing-fulfillment';

/**
 * PayPal payment button for one-time purchases (featured boost,
 * verification badge, featured week, profile spotlight).
 *
 * Calls /api/paypal/checkout, which creates a PayPal order with a
 * server-computed amount, then redirects the buyer to PayPal to
 * approve. Capture + fulfillment happen in /api/paypal/capture.
 * We never see or handle any payment details.
 */
export function PayPalButton({
  kind,
  listingId,
  locale,
  label,
}: {
  kind: OneTimeKind;
  listingId?: string;
  locale: string;
  label: string;
}) {
  const t = useTranslations('Billing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/paypal/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, listingId, locale }),
      });
      const data = (await res.json()) as { approvalUrl?: string; error?: string };
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
        return;
      }
      setError(data.error === 'paypal_not_configured' ? t('paypalNotConfigured') : t('errorGeneric'));
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button onClick={start} disabled={busy} variant="secondary">
        {busy ? '…' : `🅿️ ${label}`}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
