'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';

/**
 * Starts a Stripe Checkout Session (subscription tier, $9 boost, or a
 * one-time purchase: verification badge $29, featured week $15,
 * profile spotlight $19) and redirects the provider to Stripe's hosted
 * payment page. We never see or handle card details.
 *
 * method="paypal" routes membership subscriptions through PayPal's
 * Subscriptions API instead (needs PAYPAL_PLAN_* env). One-time
 * purchases via PayPal use the dedicated PayPalButton component.
 */
export function CheckoutButton({
  kind,
  tier,
  interval,
  listingId,
  locale,
  label,
  highlight,
  method = 'stripe',
}: {
  kind: 'subscription' | 'boost' | 'verification_badge' | 'featured_week' | 'profile_spotlight';
  tier?: 'pro' | 'business';
  interval?: 'month' | 'year';
  listingId?: string;
  locale: string;
  label: string;
  highlight?: boolean;
  method?: 'stripe' | 'paypal';
}) {
  const t = useTranslations('Billing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const endpoint = method === 'paypal' ? '/api/paypal/subscription' : '/api/stripe/checkout';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, tier, interval, listingId, locale }),
      });
      const data = (await res.json()) as { url?: string; approvalUrl?: string; error?: string };
      const redirect = data.url ?? data.approvalUrl;
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      setError(
        data.error === 'plan_not_configured' || data.error === 'paypal_not_configured'
          ? t('paypalNotConfigured')
          : t('errorGeneric')
      );
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button onClick={start} disabled={busy} variant={highlight ? 'primary' : 'secondary'}>
        {busy ? '…' : method === 'paypal' ? `🅿️ ${label}` : label}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
