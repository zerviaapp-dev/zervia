'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';
import { PayPalButton } from '@/components/billing/PayPalButton';
import { redeemPointsForBoost } from '@/lib/supabase/rewards-actions';

export type BoostListing = {
  id: string;
  title: string;
  is_featured: boolean;
  featured_until: string | null;
};

/**
 * Featured-boost purchase: 900 points OR $9 card payment — the
 * provider's choice. Points go through the ledger (Phase 4, atomic
 * balance guard); card goes through Stripe Checkout. Both activate
 * the same 7-day boost.
 */
export function BoostPurchase({
  listings,
  locale,
  stripeReady,
  paypalReady,
  boostPriceLabel,
}: {
  listings: BoostListing[];
  locale: string;
  stripeReady: boolean;
  paypalReady: boolean;
  /** Localized card price label, e.g. "CA$9.00" / "₱387" — from the server. */
  boostPriceLabel: string;
}) {
  const t = useTranslations('Billing');
  const [selected, setSelected] = useState(listings[0]?.id ?? '');
  const [busy, setBusy] = useState<'points' | 'card' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const active = listings.find((l) => l.id === selected);

  async function payWithPoints() {
    if (!selected) return;
    setBusy('points');
    setMessage(null);
    const fd = new FormData();
    fd.set('locale', locale);
    fd.set('listingId', selected);
    try {
      const res = await redeemPointsForBoost({ ok: false, message: '' }, fd);
      setOk(res.ok);
      setMessage(res.message);
    } catch {
      setOk(false);
      setMessage(t('errorGeneric'));
    } finally {
      setBusy(null);
    }
  }

  async function payWithCard() {
    if (!selected) return;
    setBusy('card');
    setMessage(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'boost', listingId: selected, locale }),
      });
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setOk(false);
      setMessage(t('errorGeneric'));
    } catch {
      setOk(false);
      setMessage(t('errorGeneric'));
    } finally {
      setBusy(null);
    }
  }

  if (listings.length === 0) return null;

  return (
    <div className="mt-4">
      <label className="mb-2 block text-base font-semibold text-brand-800">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 w-full rounded-xl border-2 border-brand-200 bg-white px-4 py-3 text-base text-brand-900"
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
              {l.is_featured ? ' ★' : ''}
            </option>
          ))}
        </select>
      </label>
      {active?.is_featured && active.featured_until ? (
        <p className="mb-3 text-sm font-semibold text-brand-700">
          {t('boostActive', { date: new Date(active.featured_until).toLocaleDateString(locale) })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button onClick={payWithPoints} disabled={busy !== null} variant="primary">
          {busy === 'points' ? '…' : t('boostPoints')}
        </Button>
        {stripeReady ? (
          <Button onClick={payWithCard} disabled={busy !== null} variant="secondary">
            {busy === 'card' ? '…' : boostPriceLabel}
          </Button>
        ) : null}
        {paypalReady ? (
          <PayPalButton kind="boost" listingId={selected} locale={locale} label={t('payWithPayPal', { price: boostPriceLabel })} />
        ) : null}
      </div>
      {message ? (
        <p className={`mt-2 text-sm font-semibold ${ok ? 'text-green-700' : 'text-red-700'}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
