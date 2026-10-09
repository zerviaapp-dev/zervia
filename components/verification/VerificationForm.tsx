'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { uploadVerificationDocument } from '@/lib/supabase/storage';
import { requestVerification } from '@/lib/supabase/verification-actions';

type DocType = 'government_id' | 'professional_license' | 'insurance_proof' | 'background_check';

const DOC_TYPES: DocType[] = ['government_id', 'professional_license', 'insurance_proof', 'background_check'];

/**
 * Verification request form: pick a document type, upload the file to the
 * private bucket, then submit the request. The file itself is never shown
 * after upload (privacy); only a "received" confirmation appears.
 */
export function VerificationForm({ locale }: { locale: string }) {
  const t = useTranslations('Trust');
  const [docType, setDocType] = useState<DocType>('government_id');
  const [storagePath, setStoragePath] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('document', file);
    fd.append('docType', docType);
    const res = await uploadVerificationDocument(fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setStoragePath(res.path);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storagePath) {
      setError(t('uploadFirst'));
      return;
    }
    setSubmitting(true);
    setError('');
    const fd = new FormData();
    fd.append('locale', locale);
    fd.append('doc_type', docType);
    fd.append('storage_path', storagePath);
    const res = await requestVerification(fd);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.message || t('submitFailed'));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
        {t('requestReceived')}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="doc_type" className="block text-sm font-semibold text-brand-900">
          {t('docTypeLabel')}
        </label>
        <select
          id="doc_type"
          value={docType}
          onChange={(e) => {
            setDocType(e.target.value as DocType);
            setStoragePath('');
          }}
          className="mt-1 block min-h-[56px] w-full rounded-2xl border-2 border-brand-200 bg-white px-4 text-base text-brand-900"
        >
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>
              {t(`docType_${d}`)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPick}
          aria-label={t('uploadLabel')}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-base font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
        >
          {busy ? t('uploading') : storagePath ? t('fileReceived') : t('uploadLabel')}
        </button>
        <p className="mt-1 text-xs text-brand-600">{t('uploadPrivacy')}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !storagePath}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {submitting ? t('submitting') : t('submitRequest')}
      </button>
    </form>
  );
}
