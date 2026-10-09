'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { updatePassword, type ActionResult } from '@/lib/supabase/actions';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

export function ResetPasswordForm() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [state, formAction] = useActionState(updatePassword, initialState);

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

      <Field label={t('newPasswordLabel')} htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder={t('passwordPlaceholder')}
          className="auth-input"
        />
      </Field>

      <Field label={t('confirmPasswordLabel')} htmlFor="confirm">
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder={t('confirmPasswordPlaceholder')}
          className="auth-input"
        />
      </Field>

      <SubmitButton>{t('resetButton')}</SubmitButton>
    </form>
  );
}
