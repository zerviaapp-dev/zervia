'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

const STORAGE_KEY = 'zervia-cookie-consent';

/**
 * Cookie consent banner — bottom sheet, brand-styled.
 * Zervia sets strictly-necessary cookies (Supabase auth session, language
 * preference). The banner records the visitor's choice in localStorage and
 * never shows again once chosen. Links to the privacy page for details.
 */
export function CookieBanner() {
  const t = useTranslations('Home');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // Storage unavailable (private mode) — show the banner each visit.
      setVisible(true);
    }
  }, []);

  const choose = (value: 'accepted' | 'declined') => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage failures; just hide the banner.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('cookieTitle')}
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-brand-100 bg-white p-5 shadow-xl">
        <p className="text-sm leading-relaxed text-brand-900">
          <span className="font-bold">{t('cookieTitle')} </span>
          {t('cookieText')}{' '}
          <Link href="/privacy" className="font-semibold text-brand-700 underline">
            {t('cookieLearnMore')}
          </Link>
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => choose('declined')}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            {t('cookieDecline')}
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t('cookieAccept')}
          </button>
        </div>
      </div>
    </div>
  );
}
