'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  startIdentityVerification,
  getMyIdentityStatus,
} from '@/lib/supabase/verification-actions';
import type { IdentityStatus } from '@/lib/verification';

/**
 * Stripe Identity ID verification button for the provider dashboard.
 *
 * Complements the manual flow (IdUploader → private bucket → admin review):
 * here Stripe handles the document capture on its hosted page, and the
 * webhook flips the status when verification completes. No document ever
 * touches Zervia's own storage in this flow.
 *
 * i18n: strings live in the `Provider` namespace. New keys are staged in
 * /tmp/keys-identity.json for merging into messages/*.json; next-intl
 * falls back to the key path until then.
 */
export function VerifyIdButton() {
  const t = useTranslations('Provider');
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getMyIdentityStatus()
      .then((res) => {
        if (!alive) return;
        setStatus(res.ok && res.status ? res.status : 'unverified');
      })
      .catch(() => {
        if (alive) setStatus('unverified');
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onVerify() {
    setBusy(true);
    setError('');
    const res = await startIdentityVerification(window.location.href);
    if (!res.ok || !res.url) {
      setBusy(false);
      setError(
        res.message === 'identity_not_configured'
          ? t('identityNotConfigured')
          : t('identityStartError')
      );
      return;
    }
    // Hand off to Stripe's hosted verification page.
    window.location.href = res.url;
  }

  const badge =
    status === 'verified' ? (
      <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
        {t('identityStatusVerified')}
      </span>
    ) : status === 'pending' ? (
      <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
        {t('identityStatusPending')}
      </span>
    ) : status === 'failed' ? (
      <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        {t('identityStatusFailed')}
      </span>
    ) : (
      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
        {t('identityStatusUnverified')}
      </span>
    );

  // Verified: a quiet confirmation only — nothing left to do.
  if (status === 'verified') {
    return (
      <div className="rounded-2xl border-2 border-green-200 bg-green-50/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-green-900">{t('verifyIdTitle')}</p>
          {badge}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-brand-100 bg-brand-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-brand-900">{t('verifyIdTitle')}</p>
          <p className="mt-1 text-sm text-brand-700">{t('verifyIdBody')}</p>
          <p className="mt-1 text-xs font-medium text-brand-600">{t('identityManualAlt')}</p>
        </div>
        {status !== null && badge}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onVerify}
          disabled={busy || status === null}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy
            ? t('verifyIdStarting')
            : status === 'failed'
              ? t('identityRetry')
              : status === 'pending'
                ? t('verifyIdResume')
                : t('verifyIdCta')}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
