'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';

/**
 * Opens Stripe's hosted Customer Portal (upgrade, downgrade, update
 * card, cancel) — all inside Stripe's UI. We never see card details.
 */
export function PortalButton({ locale, label }: { locale: string; label: string }) {
  const t = useTranslations('Billing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const data = (await res.json()) as { url?: string };
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
      <Button onClick={open} disabled={busy} variant="secondary">
        {busy ? t('portalOpening') : label}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
