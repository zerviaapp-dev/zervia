'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { updateProfile, type ActionResult } from '@/lib/supabase/actions';
import { countries } from '@/lib/countries';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

export function ProfileForm({
  initialName,
  initialCountry,
  email,
}: {
  initialName: string;
  initialCountry: string;
  email: string;
}) {
  const t = useTranslations('Auth');
  const ta = useTranslations('Account');
  const locale = useLocale();
  const [state, formAction] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

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
          type="email"
          value={email}
          disabled
          aria-disabled="true"
          className="auth-input opacity-60"
        />
      </Field>

      <Field label={ta('profileName')} htmlFor="fullName">
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          defaultValue={initialName}
          className="auth-input"
        />
      </Field>

      <Field label={ta('profileCountry')} htmlFor="country">
        <select
          id="country"
          name="country"
          required
          defaultValue={initialCountry}
          className="auth-input"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <SubmitButton>{ta('profileSave')}</SubmitButton>
    </form>
  );
}
