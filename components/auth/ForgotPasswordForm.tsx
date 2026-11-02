'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { requestPasswordReset, type ActionResult } from '@/lib/supabase/actions';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

export function ForgotPasswordForm() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [state, formAction] = useActionState(requestPasswordReset, initialState);
  const [clientError, setClientError] = useState('');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const email = e.currentTarget.elements.namedItem('email') as HTMLInputElement | null;
    if (email && !email.validity.valid) {
      // Stop the server action and show a visible message instead of the
      // silent native invalid flag alone.
      e.preventDefault();
      setClientError(t('errorInvalidEmail'));
      email.focus();
    } else {
      setClientError('');
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      <h1 className="text-3xl font-bold text-brand-900">{t('forgotTitle')}</h1>
      <p className="text-base text-brand-800">{t('forgotSubtitle')}</p>

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

      <Field label={t('emailLabel')} htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t('emailPlaceholder')}
          className="auth-input"
          aria-invalid={clientError ? 'true' : undefined}
          aria-describedby={clientError ? 'forgot-email-error' : undefined}
          onChange={() => clientError && setClientError('')}
        />
      </Field>

      {clientError ? (
        <p id="forgot-email-error" role="alert" className="-mt-3 text-sm font-medium text-red-700">
          {clientError}
        </p>
      ) : null}

      <SubmitButton>{t('forgotButton')}</SubmitButton>

      <p className="text-center text-base">
        <Link href="/login" className="font-semibold text-brand-700 underline">
          {t('backToLogin')}
        </Link>
      </p>
    </form>
  );
}
