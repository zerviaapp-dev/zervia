'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { uploadIdDocument } from '@/lib/supabase/storage';

/**
 * Government-ID upload for provider verification.
 *
 * PRIVACY: the file goes to the PRIVATE `verification-docs` bucket —
 * no public-read policy exists, so the photo can never be viewed from a
 * URL. Only the uploader and admins can fetch it (signed URLs, server-side).
 * The component never displays the document after upload: it shows only
 * a "received" confirmation, so shoulder-surfers see nothing sensitive.
 */
export function IdUploader({ alreadyProvided }: { alreadyProvided: boolean }) {
  const t = useTranslations('Moderation');
  const [done, setDone] = useState(alreadyProvided);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('idDocument', file);
    const res = await uploadIdDocument(fd);
    setBusy(false);
    if (!res.ok) {
      setError(t(res.message));
      return;
    }
    setDone(true);
  }

  return (
    <div className="rounded-2xl border-2 border-brand-100 bg-brand-50/50 p-4">
      <p className="text-base font-semibold text-brand-900">{t('idTitle')}</p>
      <p className="mt-1 text-sm text-brand-700">{t('idBody')}</p>
      <p className="mt-1 text-xs font-medium text-brand-600">{t('idPrivacy')}</p>

      {done ? (
        <p role="status" className="mt-3 rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {t('idReceived')}
        </p>
      ) : (
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPick}
            aria-label={t('idUploadCta')}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? t('photoUploading') : t('idUploadCta')}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
