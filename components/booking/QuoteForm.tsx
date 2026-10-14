'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { sendQuote } from '@/lib/supabase/quote-actions';
import type { ActionResult } from '@/lib/supabase/actions';
import { Panel } from '@/components/Panel';

const initialState = { ok: true, message: '' };

/**
 * Provider-side quote composer: price + scope + optional proposed time.
 * One live offer at a time — sending supersedes any older sent quote.
 */
export function QuoteForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings');
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    sendQuote,
    initialState
  );
  const [sent, setSent] = useState(false);

  // sendQuote returns { ok: true, message: t('quoteSent') } on success.
  // Toast feedback supplements the inline status card (kept for accessibility).
  const lastToasted = useRef('');
  useEffect(() => {
    if (state.ok && state.message) setSent(true);
    if (state.message && state.message !== lastToasted.current) {
      lastToasted.current = state.message;
      if (state.ok) toast.success(state.message);
      else toast.error(state.message);
    }
  }, [state]);

  if (sent && state.ok) {
    return (
      <Panel>
        <p
          role="status"
          className="rounded-2xl bg-green-50 px-4 py-3 text-base font-semibold text-green-800"
        >
          ✓ {t('quoteSent')}
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <h3 className="text-lg font-bold text-brand-900">{t('quoteFormTitle')}</h3>
      <p className="mt-1 text-sm text-brand-600">{t('quoteFormHint')}</p>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="bookingId" value={bookingId} />
        <div>
          <label
            htmlFor="quote-price"
            className="block text-sm font-semibold text-brand-900"
          >
            {t('quotePriceLabel')}
          </label>
          <input
            id="quote-price"
            name="price"
            inputMode="decimal"
            placeholder="75.00"
            required
            className="mt-1 block min-h-[56px] w-full rounded-2xl border-2 border-brand-200 bg-white px-4 text-base text-brand-900 placeholder:text-brand-300 focus:border-brand-600 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="quote-scope"
            className="block text-sm font-semibold text-brand-900"
          >
            {t('quoteScopeLabel')}
          </label>
          <textarea
            id="quote-scope"
            name="scope"
            rows={3}
            maxLength={1000}
            required
            placeholder={t('quoteScopePlaceholder')}
            className="mt-1 block w-full rounded-2xl border-2 border-brand-200 bg-white px-4 py-3 text-base text-brand-900 placeholder:text-brand-300 focus:border-brand-600 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="quote-time"
            className="block text-sm font-semibold text-brand-900"
          >
            {t('quoteTimeLabel')}
          </label>
          <input
            id="quote-time"
            name="proposedAt"
            type="datetime-local"
            className="mt-1 block min-h-[56px] w-full rounded-2xl border-2 border-brand-200 bg-white px-4 text-base text-brand-900 focus:border-brand-600 focus:outline-none"
          />
          <p className="mt-1 text-xs text-brand-500">{t('quoteTimeHint')}</p>
        </div>
        {!state.ok && state.message ? (
          <p role="alert" className="text-sm font-medium text-red-600">
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? t('quoteSending') : t('quoteSend')}
        </button>
      </form>
    </Panel>
  );
}
