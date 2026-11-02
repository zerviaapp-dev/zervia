'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { requestMagicLink, type ActionResult } from '@/lib/supabase/actions';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

export function MagicLinkForm() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [state, formAction] = useActionState(requestMagicLink, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      <h1 className="text-3xl font-bold text-brand-900">{t('magicTitle')}</h1>
      <p className="text-base text-brand-800">{t('magicSubtitle')}</p>

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
        />
      </Field>

      <SubmitButton>{t('magicButton')}</SubmitButton>

      <p className="text-center text-base">
        <Link href="/login" className="font-semibold text-brand-700 underline">
          {t('backToLogin')}
        </Link>
      </p>
    </form>
  );
}
