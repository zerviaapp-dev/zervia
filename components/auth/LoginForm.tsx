'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { signIn, type ActionResult } from '@/lib/supabase/actions';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

export function LoginForm() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState(signIn, initialState);

  const urlError = searchParams.get('error');
  const banner =
    urlError === 'verification'
      ? t('errorVerifyFailed')
      : urlError
        ? t('errorGeneric')
        : '';

  return (
    <form action={formAction} className="space-y-5" noValidate={false}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={searchParams.get('next') ?? ''} />

      <h1 className="text-3xl font-bold text-brand-900">{t('loginTitle')}</h1>
      <p className="text-base text-brand-800">{t('loginSubtitle')}</p>

      {banner ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {banner}
        </p>
      ) : null}
      {state.message ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
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
        />
      </Field>

      <Field label={t('passwordLabel')} htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          placeholder={t('passwordPlaceholder')}
          className="auth-input"
        />
      </Field>

      <SubmitButton>{t('loginButton')}</SubmitButton>

      <div className="flex items-center justify-between text-base">
        <Link href="/forgot-password" className="font-semibold text-brand-700 underline">
          {t('forgotPassword')}
        </Link>
        <Link href="/magic-link" className="font-semibold text-brand-700 underline">
          {t('magicLinkOption')}
        </Link>
      </div>

      <p className="text-center text-base text-brand-800">
        {t('noAccount')}{' '}
        <Link href="/signup" className="font-semibold text-brand-700 underline">
          {t('createAccount')}
        </Link>
      </p>
    </form>
  );
}
