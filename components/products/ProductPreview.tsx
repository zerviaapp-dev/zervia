'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isCourseProduct, type DigitalProduct } from '@/lib/digital-products';

/**
 * Preview modal for digital course products.
 * - If the product has a `previewVideoUrl`, plays it in an HTML5 video player.
 * - Otherwise shows a "Preview coming soon" placeholder.
 *
 * Modal is accessible: Escape closes, backdrop click closes, focus moves to
 * the close button, and background scrolling is locked while open.
 */
function PreviewModal({
  product,
  open,
  onClose,
}: {
  product: DigitalProduct;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('DigitalProducts');
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Pause the video when the modal closes mid-playback.
  useEffect(() => {
    if (!open) videoRef.current?.pause();
  }, [open ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('watchPreview')}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-brand-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <p className="truncate text-sm font-bold text-white sm:text-base">
            {t('preview')}: {product.title}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('closePreview')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
          >
            ×
          </button>
        </div>

        {product.previewVideoUrl ? (
          <video
            ref={videoRef}
            src={product.previewVideoUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-brand-900 px-6 text-center">
            <span aria-hidden className="text-5xl">
              🎬
            </span>
            <p className="text-lg font-bold text-white">{t('previewComingSoon')}</p>
            <p className="max-w-md text-sm text-brand-200">
              {t('previewComingSoonHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Watch preview" button for course products.
 *
 * `variant="detail"` — full-width button for the product detail page.
 * `variant="overlay"` — floating play button over a card thumbnail.
 *
 * Rendered only for course products; returns null for ebooks/services.
 */
export function ProductPreviewButton({
  product,
  variant,
}: {
  product: DigitalProduct;
  variant: 'detail' | 'overlay';
}) {
  const t = useTranslations('DigitalProducts');
  const [open, setOpen] = useState(false);
  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);

  if (!isCourseProduct(product)) return null;

  const handleClick = (e: React.MouseEvent) => {
    // Used inside card links — never navigate when opening the preview.
    e.preventDefault();
    e.stopPropagation();
    openModal();
  };

  return (
    <>
      {variant === 'detail' ? (
        <button
          type="button"
          onClick={handleClick}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border-2 border-brand-600 bg-white px-6 text-base font-bold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <span aria-hidden>▶</span> {t('watchPreview')}
        </button>
      ) : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={handleClick}
            aria-label={t('watchPreview')}
            className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-2xl text-brand-700 shadow-xl transition-transform hover:scale-110 hover:bg-white focus-visible:outline-2 focus-visible:outline-white"
          >
            <span aria-hidden>▶</span>
          </button>
        </div>
      )}
      <PreviewModal product={product} open={open} onClose={closeModal} />
    </>
  );
}
