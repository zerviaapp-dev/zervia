'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  requestEmailOtp,
  verifyEmailOtp,
  type OtpResult,
} from '@/lib/supabase/actions';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const initialState: OtpResult = { ok: false, message: '' };

/**
 * Email-code sign-in (Z7): step 1 asks for the email and sends a 6-digit
 * code; step 2 verifies it. Works even when link emails never arrive,
 * because no redirect/link is involved.
 */
export function EmailCodeForm() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [requestState, requestAction] = useActionState(requestEmailOtp, initialState);
  const [verifyState, verifyAction] = useActionState(verifyEmailOtp, initialState);
  const codeStage = requestState.stage === 'code' || verifyState.stage === 'code';

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('codeTitle')}</h1>
      <p className="text-base text-brand-800">{t('codeSubtitle')}</p>

      {!codeStage ? (
        <form action={requestAction} className="space-y-5">
          <input type="hidden" name="locale" value={locale} />
          {requestState.message ? (
            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {requestState.message}
            </p>
          ) : null}
          <Field label={t('emailLabel')} htmlFor="otp-email">
            <input
              id="otp-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="auth-input"
            />
          </Field>
          <SubmitButton>{t('codeRequestButton')}</SubmitButton>
        </form>
      ) : (
        <form action={verifyAction} className="space-y-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="email" value={email} />
          <p role="status" className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
            {verifyState.message || requestState.message}
          </p>
          <Field label={t('codeLabel')} htmlFor="otp-code">
            <input
              id="otp-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              placeholder="123456"
              className="auth-input text-center text-2xl font-bold tracking-[0.5em]"
            />
          </Field>
          <SubmitButton>{t('codeButton')}</SubmitButton>
          <p className="text-center text-sm text-brand-700">
            {t('verifySpamNote')}
          </p>
        </form>
      )}

      <p className="text-center text-base">
        <Link href="/login" className="font-semibold text-brand-700 underline">
          {t('backToPassword')}
        </Link>
      </p>
    </div>
  );
}
