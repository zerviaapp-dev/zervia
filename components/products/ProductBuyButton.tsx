'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/Button';

/**
 * "Buy now" for a physical product: collects the shipping address, then
 * POSTs to /api/stripe/product-checkout and redirects to Stripe's hosted
 * payment page. We never see or handle card details. The price always
 * comes from the server (products table) — never from the client.
 */
export function ProductBuyButton({
  productId,
  unitPriceCents,
  currency,
}: {
  productId: string;
  unitPriceCents: number;
  currency: string;
}) {
  const t = useTranslations('Products');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [form, setForm] = useState({
    shipName: '',
    shipAddress: '',
    shipCity: '',
    shipProvince: '',
    shipPostal: '',
    shipCountry: 'CA',
    shipPhone: '',
  });

  const total = ((unitPriceCents * quantity) / 100).toFixed(2);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/product-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity, locale, ...form }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error === 'out_of_stock' ? t('outOfStock') : t('errorGeneric'));
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  const input =
    'min-h-[48px] w-full rounded-xl border-2 border-brand-200 px-4 text-brand-900';

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="primary">
        {t('buyNow')}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-brand-100 bg-white p-5">
      <h3 className="font-bold text-brand-900">{t('shippingInfo')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={input} placeholder={t('fullName')} value={form.shipName} onChange={(e) => set('shipName', e.target.value)} />
        <input className={input} placeholder={t('phone')} value={form.shipPhone} onChange={(e) => set('shipPhone', e.target.value)} />
        <input className={`${input} sm:col-span-2`} placeholder={t('address')} value={form.shipAddress} onChange={(e) => set('shipAddress', e.target.value)} />
        <input className={input} placeholder={t('city')} value={form.shipCity} onChange={(e) => set('shipCity', e.target.value)} />
        <input className={input} placeholder={t('province')} value={form.shipProvince} onChange={(e) => set('shipProvince', e.target.value)} />
        <input className={input} placeholder={t('postal')} value={form.shipPostal} onChange={(e) => set('shipPostal', e.target.value)} />
        <input className={input} placeholder={t('country')} value={form.shipCountry} onChange={(e) => set('shipCountry', e.target.value)} />
        <label className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          {t('quantity')}
          <input
            type="number"
            min={1}
            max={99}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="min-h-[48px] w-20 rounded-xl border-2 border-brand-200 px-3"
          />
        </label>
      </div>
      <p className="font-bold text-brand-900">
        Total: {total} {currency.toUpperCase()}
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={start} disabled={busy} variant="primary">
          {busy ? '…' : t('placeOrder')}
        </Button>
        <Button onClick={() => setOpen(false)} variant="secondary">
          ✕
        </Button>
      </div>
    </div>
  );
}
