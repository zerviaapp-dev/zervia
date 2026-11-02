'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  deleteListing,
  setListingStatus,
} from '@/lib/supabase/provider-actions';

/**
 * Per-listing row actions in the provider dashboard: pause / activate /
 * delete. Each is a plain form posting to a server action — no client-side
 * data access. Delete asks for confirmation first.
 */
export function ListingRowActions({
  listingId,
  status,
}: {
  listingId: string;
  status: string;
}) {
  const t = useTranslations('Provider');
  const locale = useLocale();

  const btn =
    'inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors';

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'active' ? (
        <form action={setListingStatus}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="id" value={listingId} />
          <input type="hidden" name="status" value="paused" />
          <button
            type="submit"
            className={`${btn} border-2 border-brand-200 bg-white text-brand-700 hover:border-brand-400`}
          >
            {t('pause')}
          </button>
        </form>
      ) : (
        <form action={setListingStatus}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="id" value={listingId} />
          <input type="hidden" name="status" value="active" />
          <button
            type="submit"
            className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}
          >
            {t('activate')}
          </button>
        </form>
      )}
      <form
        action={deleteListing}
        onSubmit={(e) => {
          if (!window.confirm(t('deleteConfirm'))) e.preventDefault();
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={listingId} />
        <button
          type="submit"
          className={`${btn} border-2 border-red-200 bg-white text-red-700 hover:border-red-400`}
        >
          {t('deleteListing')}
        </button>
      </form>
    </div>
  );
}
