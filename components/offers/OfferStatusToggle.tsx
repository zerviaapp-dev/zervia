'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  setOfferStatus,
  type ActionResult,
} from '@/lib/supabase/offer-actions';

const initialState: ActionResult = { ok: false, message: '' };

/** Pause / resume toggle for one of the provider's offers. */
export function OfferStatusToggle({
  offerId,
  currentStatus,
  locale,
}: {
  offerId: string;
  currentStatus: 'active' | 'paused';
  locale: string;
}) {
  const t = useTranslations('Offers');
  const [state, formAction] = useActionState(setOfferStatus, initialState);
  const next = currentStatus === 'active' ? 'paused' : 'active';

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="status" value={next} />
      {state.message && !state.ok ? (
        <p role="alert" className="mb-1 text-xs font-medium text-red-700">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        className={`inline-flex min-h-[44px] items-center justify-center rounded-full border-2 px-5 text-sm font-semibold transition-colors ${
          currentStatus === 'active'
            ? 'border-amber-600 bg-white text-amber-700 hover:bg-amber-50'
            : 'border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50'
        }`}
      >
        {currentStatus === 'active' ? t('pause') : t('resume')}
      </button>
    </form>
  );
}
