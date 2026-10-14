'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  import1688Url,
  importSourcedProduct,
  type Import1688ActionResult,
  type ImportProductActionResult,
} from '@/lib/supabase/sourcing-actions';
import type { SourcedProduct } from '@/lib/product-sourcing';

const fetchInitial: Import1688ActionResult = { ok: true, message: '' };
const importInitial: ImportProductActionResult = { ok: true, message: '' };

function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `¥${(cents / 100).toFixed(2)}`;
}

/**
 * 1688 guided manual import: paste a 1688.com product URL → we scrape the
 * basics server-side → provider reviews (and verifies the rough Chinese→
 * English translation) → imports to their shop with a sale price.
 */
export function Import1688Form({ locale }: { locale: string }) {
  const t = useTranslations('Provider');
  const [fetchState, fetchAction, fetching] = useActionState(
    import1688Url,
    fetchInitial
  );
  const [importState, importAction, importing] = useActionState(
    importSourcedProduct,
    importInitial
  );
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('100');
  const [name, setName] = useState<string | null>(null);

  const product: SourcedProduct | undefined = fetchState.product;
  // Let the provider edit the auto-translated title before importing.
  const effectiveName = name ?? product?.name ?? '';

  return (
    <div className="space-y-4">
      <form action={fetchAction} className="flex gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input
          type="url"
          name="url"
          required
          placeholder={t('sourcing1688Placeholder')}
          className="min-h-[48px] flex-1 rounded-full border-2 border-brand-200 bg-white px-4 text-base text-brand-900 placeholder:text-brand-400 focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={fetching}
          className="inline-flex min-h-[48px] items-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {fetching ? '…' : `📥 ${t('sourcing1688Fetch')}`}
        </button>
      </form>

      {!fetchState.ok && fetchState.message && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {fetchState.message}
        </p>
      )}

      {product && (
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-500">
            {t('sourcing1688Preview')}
          </p>

          {product.originalName && product.originalName !== product.name && (
            <p className="mt-2 text-sm text-brand-500">
              {t('sourcing1688Original')}: {product.originalName}
            </p>
          )}

          <label className="mt-2 block">
            <span className="text-xs font-bold uppercase tracking-wide text-brand-500">
              {t('sourcing1688Title')} — {t('sourcing1688VerifyTranslation')}
            </span>
            <input
              type="text"
              value={effectiveName}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 min-h-[48px] w-full rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 text-base text-brand-900 focus:border-amber-500 focus:outline-none"
            />
          </label>
          <p className="mt-1 text-xs text-amber-700">
            ⚠️ {t('sourcing1688TranslationNote')}
          </p>

          <p className="mt-3 text-sm text-brand-700">
            {t('sourcingSupplierCost')}: {formatMoney(product.costCents)}{' '}
            <span className="text-brand-500">({t('sourcing1688CnyNote')})</span>
          </p>

          <form action={importAction} className="mt-3 space-y-3 border-t border-brand-100 pt-3">
            <input type="hidden" name="locale" value={locale} />
            <input
              type="hidden"
              name="product"
              value={JSON.stringify({
                ...product,
                name: effectiveName.trim() || product.name,
                priceCents: Math.round(Number(price || 0) * 100),
                stock: Math.max(0, Math.round(Number(stock || 0))),
              })}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-500">
                  {t('sourcingSalePrice')}
                </span>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="19.99"
                  className="mt-1 min-h-[48px] w-full rounded-2xl border-2 border-brand-200 px-4 text-base"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-500">
                  {t('sourcingStock')}
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-2xl border-2 border-brand-200 px-4 text-base"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={importing}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-emerald-600 px-6 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {importing ? '…' : `✅ ${t('sourcingConfirmImport')}`}
            </button>
          </form>
        </div>
      )}

      {importState.message && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            importState.ok
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {importState.message}
        </p>
      )}
    </div>
  );
}
