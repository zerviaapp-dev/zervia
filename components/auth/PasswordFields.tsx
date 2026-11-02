'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from './Field';

/**
 * Password + confirm with show/hide eye toggles and a LIVE rules
 * checklist (live-test fix batch Z6, Oct 20 2026). The rules shown are
 * exactly the ones enforced server-side by passwordMeetsPolicy in
 * lib/supabase/actions.ts: 8+ characters, a letter, a number, a special
 * character — plus "passwords match". The parent form disables submit
 * until onValidityChange reports true.
 */
export function PasswordFields({
  onValidityChange,
}: {
  onValidityChange?: (valid: boolean) => void;
}) {
  const t = useTranslations('Auth');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const rules = [
    { ok: password.length >= 8, label: t('pwRuleLength') },
    { ok: /[A-Za-z]/.test(password), label: t('pwRuleLetter') },
    { ok: /\d/.test(password), label: t('pwRuleNumber') },
    { ok: /[^A-Za-z0-9]/.test(password), label: t('pwRuleSpecial') },
    { ok: password.length > 0 && password === confirm, label: t('pwRuleMatch') },
  ];
  const allOk = rules.every((r) => r.ok);

  useEffect(() => {
    onValidityChange?.(allOk);
  }, [allOk, onValidityChange]);

  const eyeButton = (shown: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={shown ? t('hidePassword') : t('showPassword')}
      aria-pressed={shown}
      className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-2xl"
    >
      <span aria-hidden="true">{shown ? '🙈' : '👁️'}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      <Field label={t('passwordLabel')} htmlFor="password">
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('passwordPlaceholder')}
            className="auth-input w-full pr-16"
          />
          {eyeButton(showPassword, () => setShowPassword((v) => !v))}
        </div>
      </Field>

      <div aria-live="polite">
        <p className="mb-1 text-sm font-semibold text-brand-800">{t('pwRulesTitle')}</p>
        <ul className="space-y-0.5">
          {rules.map((r) => (
            <li
              key={r.label}
              className={`flex items-center gap-2 text-sm font-medium ${
                r.ok ? 'text-green-700' : 'text-brand-600'
              }`}
            >
              <span aria-hidden="true">{r.ok ? '✅' : '⬜'}</span>
              {r.label}
            </li>
          ))}
        </ul>
      </div>

      <Field label={t('confirmPasswordLabel')} htmlFor="confirm">
        <div className="relative">
          <input
            id="confirm"
            name="confirm"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('confirmPasswordPlaceholder')}
            className="auth-input w-full pr-16"
          />
          {eyeButton(showConfirm, () => setShowConfirm((v) => !v))}
        </div>
      </Field>
    </div>
  );
}
