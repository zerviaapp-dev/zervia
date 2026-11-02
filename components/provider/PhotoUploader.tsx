'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  uploadListingPhoto,
  deleteListingPhoto,
  MAX_LISTING_PHOTOS,
} from '@/lib/supabase/storage';

/**
 * Listing photo uploader: up to 5 images, preview + reorder + remove.
 * Uploads go straight to the public `listing-photos` bucket (RLS folder
 * policy); the parent form keeps the resulting URLs in a hidden input.
 */
export function PhotoUploader({
  initialPhotos,
  inputName = 'photos',
}: {
  initialPhotos: string[];
  inputName?: string;
}) {
  const t = useTranslations('Moderation');
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (photos.length >= MAX_LISTING_PHOTOS) {
      setError(t('photoMaxReached', { max: MAX_LISTING_PHOTOS }));
      return;
    }
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('photo', file);
    const res = await uploadListingPhoto(fd);
    setBusy(false);
    if (!res.ok) {
      setError(t(res.message));
      return;
    }
    setPhotos((p) => [...p, res.url]);
  }

  async function removeAt(index: number) {
    const url = photos[index];
    if (!url) return;
    setPhotos((p) => p.filter((_, i) => i !== index));
    // Best effort: orphaned objects are harmless (public bucket, tiny).
    await deleteListingPhoto(url);
  }

  function move(index: number, dir: -1 | 1) {
    setPhotos((p) => {
      const next = [...p];
      const j = index + dir;
      if (j < 0 || j >= next.length) return p;
      const [item] = next.splice(index, 1);
      next.splice(j, 0, item!);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={inputName} value={JSON.stringify(photos)} />

      <div className="grid grid-cols-3 gap-3">
        {photos.map((url, i) => (
          <div key={url} className="relative overflow-hidden rounded-2xl border-2 border-brand-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={t('photoAlt', { n: i + 1 })} className="aspect-square w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-brand-950/50 p-1.5">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={t('photoMoveLeft')}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 px-3 text-sm font-bold text-brand-800 disabled:opacity-40"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === photos.length - 1}
                aria-label={t('photoMoveRight')}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 px-3 text-sm font-bold text-brand-800 disabled:opacity-40"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={t('photoRemove')}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 px-3 text-sm font-bold text-red-700"
              >
                ✕
              </button>
            </div>
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
                {t('photoCover')}
              </span>
            )}
          </div>
        ))}

        {photos.length < MAX_LISTING_PHOTOS && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-60"
          >
            <span className="text-2xl" aria-hidden="true">+</span>
            <span className="px-2 text-center text-xs font-semibold">
              {busy ? t('photoUploading') : t('photoAdd')}
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
        aria-label={t('photoAdd')}
      />

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <p className="text-xs text-brand-600">
        {t('photoHint', { max: MAX_LISTING_PHOTOS })}
      </p>
    </div>
  );
}
