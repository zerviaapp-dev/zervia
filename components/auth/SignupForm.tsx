'use client';

import { Suspense } from 'react';
import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { signUp, type ActionResult } from '@/lib/supabase/actions';
import { countries } from '@/lib/countries';
import { localeNames, locales, type Locale } from '@/lib/locales';
import { Turnstile } from '@/components/Turnstile';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

function SignupFormInner() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [state, formAction] = useActionState(signUp, initialState);
  // ?ref=ZBXXXXXX pre-fills the referral code from an invite link.
  const refParam = (useSearchParams().get('ref') ?? '').toUpperCase().trim();

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      <h1 className="text-3xl font-bold text-brand-900">{t('signupTitle')}</h1>
      <p className="text-base text-brand-800">{t('signupSubtitle')}</p>

      {state.message ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}

      <Field label={t('nameLabel')} htmlFor="fullName">
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          placeholder={t('namePlaceholder')}
          className="auth-input"
        />
      </Field>

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t('passwordLabel')} htmlFor="password">
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
      </div>

      <Field label={t('countryLabel')} htmlFor="country">
        <select id="country" name="country" required defaultValue="" className="auth-input">
          <option value="" disabled>
            {t('countryPlaceholder')}
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('languageLabel')} htmlFor="language">
        <select id="language" name="language" defaultValue={locale} className="auth-input">
          {(locales as readonly string[]).map((l) => (
            <option key={l} value={l}>
              {localeNames[l as Locale]}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('referralCodeLabel')} htmlFor="referralCode">
        <input
          id="referralCode"
          name="referralCode"
          type="text"
          autoComplete="off"
          placeholder={t('referralCodePlaceholder')}
          defaultValue={refParam}
          maxLength={10}
          className="auth-input uppercase"
        />
        <p className="mt-2 text-sm text-brand-700">{t('referralCodeHint')}</p>
      </Field>

      <Turnstile note={t('turnstileNote')} />

      <SubmitButton>{t('signupButton')}</SubmitButton>

      <p className="text-center text-base text-brand-800">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-brand-700 underline">
          {t('signInLink')}
        </Link>
      </p>
    </form>
  );
}

/** Suspense wrapper: useSearchParams() (for ?ref= prefill) requires it. */
export function SignupForm() {
  return (
    <Suspense>
      <SignupFormInner />
    </Suspense>
  );
}
