'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  toggleProductActive,
  updateProductPrice,
  deleteProduct
} from '@/lib/supabase/product-actions';
import type { ActionResult } from '@/lib/supabase/actions';

type Product = {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  active: boolean;
  currency: string;
};

const initial: ActionResult = { ok: true, message: '' };

/**
 * Per-product row actions: edit price, activate/deactivate, delete.
 * Price editing is inline; all mutations use useActionState so the
 * two-arg server action signature typechecks.
 */
export function ProductRowActions({
  product,
  locale,
}: {
  product: Product;
  locale: string;
}) {
  const t = useTranslations('Products');
  const currentLocale = useLocale();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState((product.price_cents / 100).toFixed(2));

  const [, toggleAction] = useActionState(toggleProductActive, initial);
  const [updateState, updateAction] = useActionState(updateProductPrice, initial);
  const [deleteState, deleteAction] = useActionState(deleteProduct, initial);

  const btn =
    'inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors';

  const margin = product.price_cents - product.cost_cents;
  const feedback = updateState.message || deleteState.message;

  return (
    <div className="flex flex-col gap-2">
      {product.cost_cents > 0 && (
        <p className="text-xs text-brand-600">
          {t('costPrice')}: {(product.cost_cents / 100).toFixed(2)} · {t('margin')}:{' '}
          {(margin / 100).toFixed(2)}
        </p>
      )}
      {feedback ? (
        <p className="text-sm font-semibold text-brand-700">{feedback}</p>
      ) : null}
      {editing ? (
        <form action={updateAction} className="flex gap-2">
          <input type="hidden" name="locale" value={currentLocale} />
          <input type="hidden" name="id" value={product.id} />
          <input
            type="hidden"
            name="priceCents"
            value={String(Math.round(Number(price || 0) * 100))}
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border-2 border-brand-200 px-3"
            aria-label={t('yourPrice')}
          />
          <button
            type="submit"
            className={`${btn} shrink-0 bg-brand-600 text-white hover:bg-brand-700`}
          >
            {t('savePrice')}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`${btn} shrink-0 border-2 border-brand-200 bg-white text-brand-700`}
          >
            ✕
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`${btn} border-2 border-brand-200 bg-white text-brand-700 hover:border-brand-400`}
          >
            {t('editPrice')}
          </button>
          <form action={toggleAction}>
            <input type="hidden" name="locale" value={currentLocale} />
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="active" value={String(!product.active)} />
            <button
              type="submit"
              className={
                product.active
                  ? `${btn} border-2 border-brand-200 bg-white text-brand-700 hover:border-brand-400`
                  : `${btn} bg-brand-600 text-white hover:bg-brand-700`
              }
            >
              {product.active ? t('deactivate') : t('activate')}
            </button>
          </form>
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!window.confirm(t('deleteConfirm'))) e.preventDefault();
            }}
          >
            <input type="hidden" name="locale" value={currentLocale} />
            <input type="hidden" name="id" value={product.id} />
            <button
              type="submit"
              className={`${btn} border-2 border-red-200 bg-white text-red-600 hover:border-red-400`}
            >
              {t('delete')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
