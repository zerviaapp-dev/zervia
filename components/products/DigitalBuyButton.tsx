'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/Button';

/**
 * "Buy now" for a Zervia digital product (ebook, course, program).
 * Digital delivery — no shipping address needed. POSTs only the product
 * slug to /api/stripe/digital-checkout; the price always comes from the
 * server-side catalog. Redirects to Stripe's hosted payment page.
 */
export function DigitalBuyButton({ slug }: { slug: string }) {
  const t = useTranslations('DigitalProducts');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const res = await fetch('/api/stripe/digital-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, locale }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.error === 'unauthorized') {
        setNeedsSignIn(true);
        return;
      }
      setError(t('buyError'));
    } catch {
      setError(t('buyError'));
    } finally {
      setBusy(false);
    }
  }

  if (needsSignIn) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto"
      >
        {t('signInToBuy')}
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <Button onClick={start} disabled={busy} variant="primary" className="w-full sm:w-auto">
        {busy ? '…' : t('buyNow')}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
