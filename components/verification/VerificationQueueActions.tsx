'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  approveVerification,
  rejectVerification,
} from '@/lib/supabase/verification-actions';

/**
 * Approve / reject buttons for the admin verification queue.
 * Rejecting asks for a reason (shown to the provider).
 */
export function VerificationQueueActions({
  docId,
  locale,
}: {
  docId: string;
  locale: string;
}) {
  const t = useTranslations('Trust');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function act(action: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('locale', locale);
    fd.append('doc_id', docId);
    if (action === 'reject') fd.append('rejection_reason', reason);
    const res =
      action === 'approve' ? await approveVerification(fd) : await rejectVerification(fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.message || t('actionFailed'));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p role="status" className="text-sm font-semibold text-green-700">
        {t('actionDone')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => act('approve')}
          disabled={busy}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-green-600 px-8 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {t('approve')}
        </button>
        <button
          type="button"
          onClick={() => setRejecting((v) => !v)}
          disabled={busy}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-red-600 bg-white px-8 text-base font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {t('reject')}
        </button>
      </div>

      {rejecting && (
        <div className="space-y-2">
          <label htmlFor={`reason-${docId}`} className="block text-sm font-semibold text-brand-900">
            {t('rejectReasonLabel')}
          </label>
          <textarea
            id={`reason-${docId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="block w-full rounded-2xl border-2 border-brand-200 px-4 py-3 text-base text-brand-900"
            placeholder={t('rejectReasonHint')}
          />
          <button
            type="button"
            onClick={() => act('reject')}
            disabled={busy}
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-red-600 px-8 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {t('confirmReject')}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
