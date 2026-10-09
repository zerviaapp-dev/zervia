'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  activateOffer,
  type ActionResult,
} from '@/lib/supabase/offer-actions';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * RBC-style "Load" button for a merchant offer. After a successful load the
 * button flips to a persistent "Loaded ✓" state.
 */
export function LoadOfferButton({
  offerId,
  locale,
  alreadyLoaded,
}: {
  offerId: string;
  locale: string;
  alreadyLoaded: boolean;
}) {
  const t = useTranslations('Offers');
  const [state, formAction] = useActionState(activateOffer, initialState);
  const loaded = alreadyLoaded || state.ok;

  if (loaded) {
    return (
      <span className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-emerald-100 px-6 text-base font-semibold text-emerald-800">
        {t('loaded')}
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="offerId" value={offerId} />
      {state.message && !state.ok ? (
        <p role="alert" className="mb-2 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white transition-colors hover:bg-brand-700 active:bg-brand-800"
      >
        🎁 {t('loadOffer')}
      </button>
    </form>
  );
}
