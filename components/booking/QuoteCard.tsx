'use client';

import { useLocale, useTranslations } from 'next-intl';
import { respondQuote } from '@/lib/supabase/quote-actions';
import { Panel } from '@/components/Panel';
import { formatCurrency, type Currency } from '@/lib/currency';

export type QuoteRow = {
  id: string;
  price_cents: number;
  scope: string;
  proposed_at: string | null;
  status: 'sent' | 'accepted' | 'declined' | 'expired';
  created_at: string;
};

function formatPrice(cents: number, currency: Currency, locale: string): string {
  return formatCurrency(cents, currency, locale);
}

const STATUS_STYLE: Record<QuoteRow['status'], string> = {
  sent: 'bg-brand-100 text-brand-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-gray-100 text-gray-600',
  expired: 'bg-gray-100 text-gray-500',
};

/**
 * One quote card inside the booking thread. The customer sees accept /
 * decline on live quotes; everyone sees the status of past ones.
 * Accepted quotes lock the price (DB trigger) — shown as the agreed price.
 */
export function QuoteCard({
  quote,
  role,
  locale: localeProp,
  currency,
}: {
  quote: QuoteRow;
  role: 'customer' | 'provider';
  locale: string;
  /** Provider's currency — quotes are denominated in it. */
  currency: Currency;
}) {
  const t = useTranslations('Bookings');
  const locale = useLocale() || localeProp;
  const live = quote.status === 'sent';

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-brand-900">{t('quoteTitle')}</h3>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[quote.status]}`}
        >
          {t(`quoteStatus_${quote.status}`)}
        </span>
      </div>

      <p className="mt-2 text-3xl font-bold text-brand-900">
        {formatPrice(quote.price_cents, currency, locale)}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-base text-brand-800">
        {quote.scope}
      </p>
      <p className="mt-2 text-sm text-brand-600">
        {quote.proposed_at
          ? t('quoteProposedAt', {
              when: new Date(quote.proposed_at).toLocaleString(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })
          : t('quoteFlexible')}
      </p>

      {live && role === 'customer' ? (
        <form action={respondQuote} className="mt-4 flex flex-wrap gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="quoteId" value={quote.id} />
          <button
            type="submit"
            name="decision"
            value="accepted"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-green-600 px-8 text-base font-bold text-white hover:bg-green-700"
          >
            ✓ {t('quoteAccept')}
          </button>
          <button
            type="submit"
            name="decision"
            value="declined"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-8 text-base font-semibold text-brand-700 hover:border-brand-400"
          >
            {t('quoteDecline')}
          </button>
        </form>
      ) : null}

      {quote.status === 'accepted' ? (
        <p className="mt-3 rounded-2xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-800">
          {t('quoteAgreedNote')}
        </p>
      ) : null}
    </Panel>
  );
}
