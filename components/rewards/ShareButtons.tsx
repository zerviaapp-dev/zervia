'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Invite share buttons: copy code, copy link, WhatsApp, SMS, Email.
 * All share the same prefilled invite text with the user's code.
 */
export function ShareButtons({
  code,
  localePrefix,
}: {
  code: string;
  localePrefix: string;
}) {
  const t = useTranslations('Rewards');
  const [copied, setCopied] = useState(false);

  const inviteLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}${localePrefix}/signup?ref=${encodeURIComponent(code)}`
      : '';
  const message = t('inviteMessage', { code, link: inviteLink });

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (older browsers): fall back to a prompt-less
      // textarea trick.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const btn =
    'inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50';

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => copyText(code)}
        className={btn}
        aria-live="polite"
      >
        {copied ? t('copied') : t('copyCode')}
      </button>
      <button
        type="button"
        onClick={() => copyText(inviteLink)}
        className={btn}
      >
        {t('copyLink')}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={btn}
      >
        {t('shareWhatsApp')}
      </a>
      <a href={`sms:?&body=${encodeURIComponent(message)}`} className={btn}>
        {t('shareSms')}
      </a>
      <a
        href={`mailto:?subject=${encodeURIComponent(t('shareEmailSubject'))}&body=${encodeURIComponent(message)}`}
        className={btn}
      >
        {t('shareEmail')}
      </a>
    </div>
  );
}
