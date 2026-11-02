'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { updatePassword, type ActionResult } from '@/lib/supabase/actions';
import { PasswordFields } from './PasswordFields';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

export function ResetPasswordForm() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [state, formAction] = useActionState(updatePassword, initialState);
  const [pwValid, setPwValid] = useState(false);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      <h1 className="text-3xl font-bold text-brand-900">{t('resetTitle')}</h1>
      <p className="text-base text-brand-800">{t('resetSubtitle')}</p>

      {state.message ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}

      <PasswordFields onValidityChange={setPwValid} />

      <SubmitButton disabled={!pwValid}>{t('resetButton')}</SubmitButton>
    </form>
  );
}
