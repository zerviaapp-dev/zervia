'use client';

import { useTranslations } from 'next-intl';
import { SearchAutocomplete } from '@/components/SearchAutocomplete';

/**
 * Hero search bar for the marketing homepage.
 * Same live type-ahead suggestions as Discover / the customer
 * dashboard (Liz, Oct 20, 2026 — build one, apply to all): typing
 * shows matching categories, service types and phrases before the
 * customer ever presses Search. Submits to /discover (locale-aware).
 */
export function HeroSearch() {
  const t = useTranslations('Home');

  return (
    <div className="mx-auto mt-8 w-full max-w-xl">
      <SearchAutocomplete
        idPrefix="hero"
        placeholder={t('searchPlaceholder')}
        searchButtonLabel={t('searchButton')}
        inputClassName="auth-input min-h-[56px] rounded-full py-4 pl-6 pr-4 text-base"
      />
    </div>
  );
}
