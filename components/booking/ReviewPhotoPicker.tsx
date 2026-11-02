'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { uploadCustomerPhoto, MAX_REVIEW_PHOTOS } from '@/lib/supabase/storage';

/**
 * Before/after photo picker for reviews: up to 3 images.
 * Uploads go straight to the public `listing-photos` bucket under the
 * customer's own folder; the parent form keeps the URLs in a hidden input.
 */
export function ReviewPhotoPicker({ inputName = 'photo_urls' }: { inputName?: string }) {
  const t = useTranslations('Bookings');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (photos.length >= MAX_REVIEW_PHOTOS) {
      setError(t('reviewPhotosMax', { max: MAX_REVIEW_PHOTOS }));
      return;
    }
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('photo', file);
    const res = await uploadCustomerPhoto(fd);
    setBusy(false);
    if (!res.ok) {
      setError(t(res.message));
      return;
    }
    setPhotos((p) => [...p, res.url]);
  }

  async function removeAt(index: number) {
    setPhotos((p) => p.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={inputName} value={JSON.stringify(photos)} />

      <div className="grid grid-cols-3 gap-3">
        {photos.map((url, i) => (
          <div key={url} className="relative overflow-hidden rounded-2xl border-2 border-brand-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={t('reviewPhotoAlt', { n: i + 1 })} className="aspect-square w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label={t('reviewPhotoRemove')}
              className="absolute right-1 top-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 px-3 text-sm font-bold text-red-700"
            >
              ✕
            </button>
          </div>
        ))}

        {photos.length < MAX_REVIEW_PHOTOS && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-60"
          >
            <span className="text-2xl" aria-hidden="true">📷</span>
            <span className="px-2 text-center text-xs font-semibold">
              {busy ? t('reviewPhotoUploading') : t('reviewPhotoAdd')}
            </span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
        aria-label={t('reviewPhotoAdd')}
      />

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <p className="text-xs text-brand-600">
        {t('reviewPhotosHint', { max: MAX_REVIEW_PHOTOS })}
      </p>
    </div>
  );
}
