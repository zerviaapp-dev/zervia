'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Panel } from '@/components/Panel';
import { releaseEscrow, refundEscrow, resolveDispute } from '@/lib/supabase/escrow-actions';

/**
 * Admin-only dispute mediation panel, rendered on the booking detail
 * page when the viewer is an admin and the booking is disputed.
 * Actions: release the held payment to the provider, or refund it to
 * the customer. Resolving also closes the booking (completed/cancelled)
 * and stamps the resolution for the audit trail.
 */
export function DisputeResolutionPanel({
  bookingId,
  escrowStatus,
}: {
  bookingId: string;
  escrowStatus: 'held' | 'released' | 'refunded' | 'disputed' | null;
}) {
  const t = useTranslations('Payments');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setMessage('');
    setIsError(false);
    startTransition(async () => {
      if (!window.confirm(t('resolveConfirm'))) return;
      const res = await action();
      setIsError(!res.ok);
      setMessage(res.message);
    });
  }

  const danger =
    'inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-red-200 bg-white px-8 text-base font-semibold text-red-700 hover:border-red-400 disabled:opacity-60';
  const primary =
    'inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60';

  return (
    <Panel>
      <h2 className="text-xl font-bold text-brand-900">{t('mediationTitle')}</h2>
      <p className="mt-1 text-sm text-brand-600">
        {t('mediationSubtitle', { status: escrowStatus ?? t('noEscrow') })}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => resolveDispute(bookingId, 'release', locale))}
          className={primary}
        >
          {t('releaseToProvider')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => resolveDispute(bookingId, 'refund', locale))}
          className={danger}
        >
          {t('refundToCustomer')}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 border-t border-brand-100 pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => releaseEscrow(bookingId, locale))}
          className={primary}
        >
          {t('manualRelease')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => refundEscrow(bookingId, locale))}
          className={danger}
        >
          {t('manualRefund')}
        </button>
      </div>
      {message ? (
        <p
          role={isError ? 'alert' : 'status'}
          className={`mt-3 text-sm font-semibold ${isError ? 'text-red-600' : 'text-emerald-700'}`}
        >
          {message}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-brand-500">{t('testModeNote')}</p>
    </Panel>
  );
}
