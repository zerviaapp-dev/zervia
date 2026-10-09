'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { requestDataAction, type ActionResult } from '@/lib/supabase/moderation-actions';
import { SubmitButton } from '@/components/auth/SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * GDPR/PIPEDA self-service: request a copy of my data, or request
 * deletion. Creates a data_requests row; the admin works the queue and
 * performs the actual purge in Supabase (documented in RECOVERY.md) so
 * a UI bug can never wipe the wrong rows. One open request per type.
 */
export function PrivacyForm() {
  const t = useTranslations('Moderation');
  const locale = useLocale();
  const [state, formAction] = useActionState(requestDataAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      {state.message && (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            state.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {state.message}
        </p>
      )}

      <fieldset>
        <legend className="mb-2 text-base font-semibold text-brand-900">
          {t('dataRequestLabel')}
        </legend>
        <div className="space-y-2">
          <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-brand-100 px-4 has-checked:border-brand-600 has-checked:bg-brand-50">
            <input
              type="radio"
              name="type"
              value="export"
              required
              className="h-5 w-5 accent-brand-600"
            />
            <span className="text-base text-brand-900">{t('dataRequestExport')}</span>
          </label>
          <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-brand-100 px-4 has-checked:border-brand-600 has-checked:bg-brand-50">
            <input
              type="radio"
              name="type"
              value="deletion"
              className="h-5 w-5 accent-brand-600"
            />
            <span className="text-base text-brand-900">{t('dataRequestDeletion')}</span>
          </label>
        </div>
      </fieldset>

      <p className="text-sm text-brand-700">{t('dataRequestNote')}</p>

      <SubmitButton>{t('dataRequestSubmit')}</SubmitButton>
    </form>
  );
}
