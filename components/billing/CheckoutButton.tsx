'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';

/**
 * Starts a Stripe Checkout Session (subscription tier, $9 boost, or a
 * one-time purchase: verification badge $29, featured week $15,
 * profile spotlight $19) and redirects the provider to Stripe's hosted
 * payment page. We never see or handle card details.
 */
export function CheckoutButton({
  kind,
  tier,
  interval,
  listingId,
  locale,
  label,
  highlight,
}: {
  kind: 'subscription' | 'boost' | 'verification_badge' | 'featured_week' | 'profile_spotlight';
  tier?: 'pro' | 'business';
  interval?: 'month' | 'year';
  listingId?: string;
  locale: string;
  label: string;
  highlight?: boolean;
}) {
  const t = useTranslations('Billing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, tier, interval, listingId, locale }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(t('errorGeneric'));
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button onClick={start} disabled={busy} variant={highlight ? 'primary' : 'secondary'}>
        {busy ? '…' : label}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
