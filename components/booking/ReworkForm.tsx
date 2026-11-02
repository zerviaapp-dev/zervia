'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Panel } from '@/components/Panel';
import { requestRework } from '@/lib/supabase/escrow-actions';
import type { ActionResult } from '@/lib/supabase/actions';

const initial: ActionResult = { ok: false, message: '' };

/**
 * 48-hour rework request. Shown to the customer on a completed booking
 * while the window is open. One request per booking; the booking stays
 * 'completed' — the request is a flag the provider sees.
 */
export function ReworkForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Payments');
  const locale = useLocale();
  const [state, action, pending] = useActionState(requestRework, initial);

  if (state.ok) {
    return (
      <Panel>
        <p role="status" className="text-base font-semibold text-emerald-700">
          {state.message}
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <h2 className="text-xl font-bold text-brand-900">{t('reworkTitle')}</h2>
      <p className="mt-1 text-sm text-brand-600">{t('reworkSubtitle')}</p>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="bookingId" value={bookingId} />
        <label
          htmlFor={`rework-notes-${bookingId}`}
          className="block text-sm font-semibold text-brand-900"
        >
          {t('reworkNotesLabel')}
        </label>
        <textarea
          id={`rework-notes-${bookingId}`}
          name="notes"
          rows={3}
          maxLength={2000}
          className="block min-h-[88px] w-full rounded-2xl border-2 border-brand-200 bg-white px-4 py-3 text-base text-brand-900"
          placeholder={t('reworkNotesPlaceholder')}
        />
        {state.message ? (
          <p role="alert" className="text-sm font-medium text-red-600">
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-base font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
        >
          {pending ? t('submitting') : t('requestRework')}
        </button>
      </form>
    </Panel>
  );
}
