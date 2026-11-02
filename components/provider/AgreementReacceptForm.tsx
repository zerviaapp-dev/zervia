'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Re-acceptance form for the Provider Agreement gate: the same
 * acceptance mechanics as onboarding (required checkbox + initials as
 * signature). Posts to /api/provider/agreement, which records the
 * current agreement_version on the provider row, then returns the
 * provider to `nextPath` (already sanitized server-side).
 */
export function AgreementReacceptForm({
  locale,
  nextPath,
}: {
  locale: string;
  nextPath: string;
}) {
  const t = useTranslations('Provider');
  const [accepted, setAccepted] = useState(false);
  const [initials, setInitials] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const initialsValid =
    initials.trim().length >= 2 && initials.trim().length <= 10;
  const canSubmit = accepted && initialsValid && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set('locale', locale);
      formData.set('agreementAccepted', accepted ? 'true' : 'false');
      formData.set('agreementInitials', initials.trim());
      const res = await fetch('/api/provider/agreement', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (res.ok && data?.ok) {
        window.location.href = nextPath;
        return;
      }
      setMessage(data?.message ?? t('errorGeneric'));
    } catch {
      setMessage(t('errorGeneric'));
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-2xl bg-white p-3">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 h-6 w-6 shrink-0 accent-brand-600"
        />
        <span className="text-sm font-semibold text-brand-900">
          {t('agreementAccept')}
        </span>
      </label>
      {/* Initials as signature (Liz): required alongside the checkbox,
          same as onboarding. */}
      <div>
        <label
          htmlFor="agreementInitials"
          className="mb-1 block text-sm font-semibold text-brand-900"
        >
          {t('agreementInitials')}
        </label>
        <input
          id="agreementInitials"
          value={initials}
          onChange={(e) => setInitials(e.target.value)}
          placeholder={t('agreementInitialsHint')}
          maxLength={10}
          className="auth-input w-full max-w-[220px] rounded-2xl px-4 py-3 text-base uppercase"
        />
        {!initialsValid && initials.length > 0 ? (
          <p className="mt-1 text-sm font-medium text-red-700">
            {t('errorAgreementInitials')}
          </p>
        ) : null}
      </div>
      {message ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('reacceptSubmit')}
      </button>
    </form>
  );
}
