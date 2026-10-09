'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createOffer,
  type ActionResult,
} from '@/lib/supabase/offer-actions';
import { SubmitButton } from '@/components/auth/SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

const inputCls =
  'auth-input min-h-[56px] w-full rounded-2xl px-4 text-base';

/**
 * Provider offer creation form. Reward is in points (100 pts = $1 CAD);
 * min spend is entered in whole dollars and converted to cents server-side
 * by the form (the action expects cents — we convert on submit via a hidden
 * transform: dollars * 100).
 */
export function CreateOfferForm({ locale }: { locale: string }) {
  const t = useTranslations('Offers');
  const [state, formAction] = useActionState(createOffer, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />

      {state.message ? (
        <p
          role="alert"
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            state.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div>
        <label htmlFor="offer-title" className="mb-1 block text-sm font-semibold text-brand-900">
          {t('titleLabel')}
        </label>
        <input
          id="offer-title"
          name="title"
          required
          minLength={3}
          maxLength={80}
          placeholder="500 pts back on your first booking"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="offer-desc" className="mb-1 block text-sm font-semibold text-brand-900">
          {t('descriptionLabel')}
        </label>
        <textarea
          id="offer-desc"
          name="description"
          maxLength={280}
          rows={2}
          placeholder="New customers earn bonus points when their booking completes."
          className="auth-input w-full rounded-2xl px-4 py-3 text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="offer-reward" className="mb-1 block text-sm font-semibold text-brand-900">
            {t('rewardLabel')}
          </label>
          <input
            id="offer-reward"
            name="rewardPoints"
            type="number"
            required
            min={1}
            max={100000}
            step={1}
            placeholder="500"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-brand-600">{t('rewardHint')}</p>
        </div>
        <div>
          <label htmlFor="offer-minspend" className="mb-1 block text-sm font-semibold text-brand-900">
            {t('minSpendDollarsLabel')}
          </label>
          <input
            id="offer-minspend"
            name="minSpendDollars"
            type="number"
            min={0}
            step={1}
            placeholder="30"
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="offer-maxred" className="mb-1 block text-sm font-semibold text-brand-900">
            {t('maxRedemptionsLabel')}{' '}
            <span className="font-normal text-brand-500">({t('optional')})</span>
          </label>
          <input
            id="offer-maxred"
            name="maxRedemptions"
            type="number"
            min={1}
            step={1}
            placeholder="100"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="offer-ends" className="mb-1 block text-sm font-semibold text-brand-900">
            {t('endsAtLabel')}{' '}
            <span className="font-normal text-brand-500">({t('optional')})</span>
          </label>
          <input
            id="offer-ends"
            name="endsAt"
            type="date"
            className={inputCls}
          />
        </div>
      </div>

      <SubmitButton>{t('createButton')}</SubmitButton>
    </form>
  );
}
