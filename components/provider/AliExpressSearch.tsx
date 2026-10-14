'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  searchAliExpress,
  importSourcedProduct,
  type AliExpressSearchActionResult,
  type ImportProductActionResult,
} from '@/lib/supabase/sourcing-actions';
import type { SourcedProduct } from '@/lib/product-sourcing';

const searchInitial: AliExpressSearchActionResult = { ok: true, message: '' };
const importInitial: ImportProductActionResult = { ok: true, message: '' };

function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * AliExpress catalog search for providers. Search runs server-side
 * (API keys never touch the browser). Each result can be imported to the
 * provider's shop with a sale price.
 */
export function AliExpressSearch({ locale }: { locale: string }) {
  const t = useTranslations('Provider');
  const [searchState, searchAction, searching] = useActionState(
    searchAliExpress,
    searchInitial
  );
  const [importState, importAction, importing] = useActionState(
    importSourcedProduct,
    importInitial
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { price: string; stock: string }>
  >({});

  const products = searchState.products ?? [];

  function draftFor(key: string) {
    return drafts[key] ?? { price: '', stock: '100' };
  }

  function buildPayload(p: SourcedProduct): string {
    const d = draftFor(p.supplierProductId);
    return JSON.stringify({
      ...p,
      priceCents: Math.round(Number(d.price || 0) * 100),
      stock: Math.max(0, Math.round(Number(d.stock || 0))),
    });
  }

  return (
    <div className="space-y-4">
      <form action={searchAction} className="flex gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input
          type="search"
          name="query"
          required
          minLength={2}
          placeholder={t('sourcingSearchPlaceholder')}
          className="min-h-[48px] flex-1 rounded-full border-2 border-brand-200 bg-white px-4 text-base text-brand-900 placeholder:text-brand-400 focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={searching}
          className="inline-flex min-h-[48px] items-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {searching ? '…' : `🔍 ${t('sourcingSearchButton')}`}
        </button>
      </form>

      {!searchState.ok && searchState.message && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {searchState.message}
        </p>
      )}

      {searchState.ok && searchState.isSample && products.length > 0 && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ {t('sourcingSampleNotice')}
        </p>
      )}

      {products.length > 0 && (
        <ul className="space-y-3">
          {products.map((p: SourcedProduct) => {
            const key = p.supplierProductId;
            const isOpen = expanded === key;
            const d = draftFor(key);
            return (
              <li
                key={key}
                className="rounded-2xl border border-brand-100 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-brand-900">{p.name}</p>
                    <p className="mt-1 text-sm text-brand-700">
                      {t('sourcingSupplierCost')}: {formatMoney(p.costCents)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border-2 border-brand-600 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    🛍️ {t('sourcingAddToShop')}
                  </button>
                </div>

                {isOpen && (
                  <form
                    action={importAction}
                    className="mt-3 space-y-3 border-t border-brand-100 pt-3"
                  >
                    <input type="hidden" name="locale" value={locale} />
                    <input
                      type="hidden"
                      name="product"
                      value={buildPayload(p)}
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
                          value={d.price}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: { ...draftFor(key), price: e.target.value },
                            }))
                          }
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
                          value={d.stock}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: { ...draftFor(key), stock: e.target.value },
                            }))
                          }
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
                )}
              </li>
            );
          })}
        </ul>
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
