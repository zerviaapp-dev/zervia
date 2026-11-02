'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { resendConfirmation, type ActionResult } from '@/lib/supabase/actions';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * "Didn't get the email?" — resend the signup confirmation link.
 * The server action always reports success to avoid account enumeration.
 */
export function ResendConfirmationForm() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [state, formAction] = useActionState(resendConfirmation, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4 text-left">
      <input type="hidden" name="locale" value={locale} />

      <h2 className="text-center text-lg font-bold text-brand-900">
        {t('verifyResendTitle')}
      </h2>

      {state.message ? (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            state.ok ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <Field label={t('emailLabel')} htmlFor="resend-email">
        <input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t('emailPlaceholder')}
          className="auth-input"
        />
      </Field>

      <SubmitButton>{t('verifyResendButton')}</SubmitButton>
    </form>
  );
}
