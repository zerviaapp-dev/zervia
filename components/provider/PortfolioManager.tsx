'use client';

import { useActionState, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  addPortfolioItem,
  deletePortfolioItem
} from '@/lib/supabase/portfolio-actions';
import type { ActionResult } from '@/lib/supabase/actions';
import { uploadCustomerPhoto, MAX_PORTFOLIO_ITEMS } from '@/lib/supabase/storage';
import { SubmitButton } from '@/components/auth/SubmitButton';

const addInitial: ActionResult = { ok: false, message: '' };
const delInitial: ActionResult = { ok: false, message: '' };

export type PortfolioItem = {
  id: string;
  photo_url: string;
  caption: string | null;
};

/**
 * "Past work" gallery manager for the provider dashboard.
 * Photo uploads go straight to storage; the server action records the row.
 * Deletions go through the server action (ownership-checked).
 */
export function PortfolioManager({ items }: { items: PortfolioItem[] }) {
  const t = useTranslations('Provider');
  const locale = useLocale();
  const [addState, addAction] = useActionState(addPortfolioItem, addInitial);
  const [delState, delAction] = useActionState(deletePortfolioItem, delInitial);
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setUploadError('');
    const fd = new FormData();
    fd.append('photo', file);
    const res = await uploadCustomerPhoto(fd);
    setBusy(false);
    if (!res.ok) {
      setUploadError(t(res.message));
      return;
    }
    setPhotoUrl(res.url);
  }

  return (
    <div className="space-y-4">
      {delState.message ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {delState.message}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-2xl border-2 border-brand-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.photo_url} alt={item.caption || t('portfolioPhotoAlt')} className="aspect-square w-full object-cover" />
              {item.caption ? (
                <p className="px-3 py-2 text-sm text-brand-800">{item.caption}</p>
              ) : null}
              <form action={delAction} className="px-3 pb-3">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="itemId" value={item.id} />
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  {t('portfolioDelete')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-brand-700">{t('portfolioEmpty')}</p>
      )}

      {items.length < MAX_PORTFOLIO_ITEMS ? (
        <form action={addAction} className="space-y-3 rounded-2xl bg-brand-50 p-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="photoUrl" value={photoUrl} />

          {addState.message ? (
            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {addState.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-full border-2 border-dashed border-brand-300 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
            >
              <span aria-hidden="true">{photoUrl ? '✅' : '📷'}</span>
              {busy ? t('portfolioUploading') : photoUrl ? t('portfolioPhotoPicked') : t('portfolioAddPhoto')}
            </button>
            {photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photoUrl} alt={t('portfolioPhotoAlt')} className="h-16 w-16 rounded-xl object-cover" />
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPick}
            aria-label={t('portfolioAddPhoto')}
          />
          {uploadError && (
            <p role="alert" className="text-sm font-medium text-red-600">{uploadError}</p>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-900">{t('portfolioCaptionLabel')}</span>
            <input
              type="text"
              name="caption"
              maxLength={140}
              placeholder={t('portfolioCaptionPlaceholder')}
              className="auth-input"
            />
          </label>

          <SubmitButton>{t('portfolioSave')}</SubmitButton>
          <p className="text-xs text-brand-600">{t('portfolioHint', { max: MAX_PORTFOLIO_ITEMS })}</p>
        </form>
      ) : (
        <p className="text-sm font-medium text-brand-700">{t('portfolioMaxReached', { max: MAX_PORTFOLIO_ITEMS })}</p>
      )}
    </div>
  );
}
