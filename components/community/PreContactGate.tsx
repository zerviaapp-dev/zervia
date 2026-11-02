'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Pre-contact gate for Community providers (spec §3b): the disclaimer
 * and safety checklist MUST be shown — and acknowledged — before any
 * contact details or contact/match form are revealed. Acknowledgement
 * is remembered per provider for the browser session only.
 */
export function PreContactGate({
  providerId,
  children,
}: {
  providerId: string;
  children: ReactNode;
}) {
  const t = useTranslations('Community');
  const [acked, setAcked] = useState(false);
  const [open, setOpen] = useState(false);
  const storageKey = `zervia-community-ack:${providerId}`;

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(storageKey) === '1') setAcked(true);
    } catch {
      /* storage unavailable — gate simply shows every time */
    }
  }, [storageKey]);

  if (acked) return <>{children}</>;

  const checklist = [
    t('safetyMeet'),
    t('safetyPay'),
    t('safetyWritten'),
    t('safetyOnPlatform'),
    t('safetyReport'),
  ];

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-base font-bold text-amber-900">⚠ {t('label')}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="mt-3 inline-flex min-h-[56px] items-center justify-center rounded-full bg-amber-600 px-8 text-base font-semibold text-white hover:bg-amber-700"
      >
        {t('modalTitle')}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('modalTitle')}
          className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-brand-900">{t('modalTitle')}</h2>
            <p className="mt-3 text-sm leading-relaxed text-brand-800">
              {t('disclaimer')}
            </p>
            <h3 className="mt-4 text-base font-bold text-brand-900">
              {t('safetyTitle')}
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-800">
              {checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700"
              >
                {t('modalCancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.sessionStorage.setItem(storageKey, '1');
                  } catch {
                    /* non-fatal */
                  }
                  setAcked(true);
                  setOpen(false);
                }}
                className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700"
              >
                {t('modalConfirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
