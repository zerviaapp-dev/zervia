'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { addProductFromCj} from '@/lib/supabase/product-actions';
import type { ActionResult } from '@/lib/supabase/actions';
import type { CjProductSummary } from '@/lib/cj-dropshipping';

const initial: ActionResult = { ok: true, message: '' };

/**
 * "Add to my shop" form for one CJ catalog item. The provider sets their
 * selling price (pre-filled with a 2.5x markup suggestion); the action
 * validates price >= cost server-side.
 */
export function CjAddToShopForm({ item }: { item: CjProductSummary }) {
  const t = useTranslations('Products');
  const locale = useLocale();
  const [state, action] = useActionState(addProductFromCj, initial);

  const costUsd = item.sellPrice ?? 0;
  const costCents = Math.round(costUsd * 1.36 * 100); // ~USD→CAD
  const suggestedCents = Math.round(costUsd * 2.5 * 1.36 * 100);

  return (
    <form action={action} className="mt-auto">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="cjPid" value={item.pid} />
      <input type="hidden" name="name" value={item.productName} />
      <input type="hidden" name="costCents" value={String(costCents)} />
      <input type="hidden" name="image" value={item.productImage ?? ''} />
      <label className="mb-2 block text-sm font-semibold text-brand-800">
        {t('yourPrice')} (CAD)
        <input
          type="number"
          name="priceCents"
          min="1"
          step="1"
          defaultValue={String(suggestedCents)}
          className="mt-1 min-h-[44px] w-full rounded-xl border-2 border-brand-200 px-3"
        />
      </label>
      {state.message ? (
        <p className="mb-2 text-sm font-semibold text-brand-700">{state.message}</p>
      ) : null}
      <button
        type="submit"
        className="min-h-[48px] w-full rounded-full bg-brand-600 font-semibold text-white hover:bg-brand-700"
      >
        {t('addToShop')}
      </button>
    </form>
  );
}
