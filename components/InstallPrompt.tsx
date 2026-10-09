'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * "Install Zervia" banner (Android/Chrome). Shows only when the browser
 * fires beforeinstallprompt AND the app isn't already installed.
 * Dismissal is remembered in localStorage — never nag.
 */
export function InstallPrompt() {
  const t = useTranslations('Moderation');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem('zervia-install-dismissed') === '1') return;
    } catch {
      // Storage unavailable: stay hidden rather than nag.
      return;
    }
    setDismissed(false);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferred || dismissed) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  function dismiss() {
    try {
      localStorage.setItem('zervia-install-dismissed', '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <div
      role="region"
      aria-label={t('installTitle')}
      className="fixed inset-x-4 bottom-4 z-40 rounded-3xl border-2 border-brand-100 bg-white p-4 shadow-xl"
    >
      <p className="text-base font-bold text-brand-900">{t('installTitle')}</p>
      <p className="mt-1 text-sm text-brand-700">{t('installBody')}</p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={install}
          className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700"
        >
          {t('installCta')}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700"
        >
          {t('installDismiss')}
        </button>
      </div>
    </div>
  );
}
