'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * One-tap share for a listing. Uses the Web Share API on mobile when
 * available; otherwise falls back to copy-link plus WhatsApp / Facebook /
 * X share URLs.
 */
export function ShareListingButton({
  title,
  listingId,
}: {
  title: string;
  listingId: string;
}) {
  const t = useTranslations('Discover');
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/listings/${listingId}`
      : `/listings/${listingId}`;
  const text = t('shareListingText', { title });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    // Native share sheet on mobile (and desktop browsers that support it).
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // User dismissed the sheet — don't open the fallback menu.
        return;
      }
    }
    setOpen((v) => !v);
  }

  const btn =
    'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border-2 border-brand-600 bg-white px-5 text-base font-semibold text-brand-700 hover:bg-brand-50';

  const menuBtn =
    'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-semibold text-brand-800 hover:bg-brand-50';

  return (
    <div className="relative">
      <button type="button" onClick={share} className={btn} aria-haspopup="menu" aria-expanded={open}>
        <span aria-hidden="true">↗</span>
        {t('shareListing')}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-brand-100 bg-white p-2 shadow-xl"
        >
          <button type="button" onClick={copyLink} className={menuBtn} role="menuitem">
            <span aria-hidden="true">🔗</span>
            {copied ? t('linkCopied') : t('copyListingLink')}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={menuBtn}
            role="menuitem"
          >
            <span aria-hidden="true">💬</span>
            {t('shareViaWhatsApp')}
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={menuBtn}
            role="menuitem"
          >
            <span aria-hidden="true">📘</span>
            {t('shareViaFacebook')}
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={menuBtn}
            role="menuitem"
          >
            <span aria-hidden="true">✖</span>
            {t('shareViaX')}
          </a>
        </div>
      ) : null}
    </div>
  );
}
