'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  redeemPointsForBoost,
  type ActionResult,
} from '@/lib/supabase/rewards-actions';
import { SubmitButton } from '@/components/auth/SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * Redeem points for a 7-day featured boost on one of the caller's listings.
 * Clearly labelled: points are reserved now; the boost itself activates
 * when payments go live (Phase 5) — the Phase 5 checkout settles this
 * redemption row by its reference_id (the listing).
 */
export function RedeemBoost({
  listings,
  balance,
  cost,
  locale,
}: {
  listings: { id: string; title: string }[];
  balance: number;
  cost: number;
  locale: string;
}) {
  const t = useTranslations('Rewards');
  const [state, formAction] = useActionState(redeemPointsForBoost, initialState);

  if (listings.length === 0) {
    return (
      <p className="text-base text-brand-800">{t('redeemNoListings')}</p>
    );
  }

  const affordable = balance >= cost;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />

      {state.message ? (
        <p
          role="alert"
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            state.ok
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <label
        htmlFor="redeem-listing"
        className="block text-base font-semibold text-brand-900"
      >
        {t('redeemChooseListing')}
      </label>
      <select
        id="redeem-listing"
        name="listingId"
        required
        defaultValue=""
        className="auth-input"
      >
        <option value="" disabled>
          {t('redeemChooseListing')}
        </option>
        {listings.map((l) => (
          <option key={l.id} value={l.id}>
            {l.title}
          </option>
        ))}
      </select>

      <div className="flex items-center justify-between text-base">
        <span className="text-brand-800">{t('redeemBoostTitle')}</span>
        <span className="font-bold text-brand-900">
          {t('redeemCost', { points: cost })}
        </span>
      </div>

      {!affordable ? (
        <p className="text-base font-medium text-red-700">
          {t('redeemInsufficient', { points: cost, balance })}
        </p>
      ) : null}

      <SubmitButton disabled={!affordable}>
        {t('redeemButton')}
      </SubmitButton>
    </form>
  );
}
