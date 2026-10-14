'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

/**
 * Hero search bar for the marketing homepage.
 * Submits to /discover?q=<query> using locale-aware routing.
 * 56px tap targets, keyboard accessible (Enter submits).
 */
export function HeroSearch() {
  const t = useTranslations('Home');
  const router = useRouter();
  const [query, setQuery] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/discover?q=${encodeURIComponent(trimmed)}` : '/discover');
  };

  return (
    <form onSubmit={submit} role="search" aria-label={t('searchPlaceholder')} className="mx-auto mt-8 w-full max-w-xl">
      <div className="flex gap-2">
        <label htmlFor="hero-search" className="sr-only">
          {t('searchPlaceholder')}
        </label>
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl" aria-hidden="true">
            🔍
          </span>
          <input
            id="hero-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className="auth-input min-h-[56px] w-full rounded-full py-4 pl-12 pr-4 text-base"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-[56px] shrink-0 items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white transition-all duration-200 hover:bg-brand-700 active:scale-[0.98]"
        >
          {t('searchButton')}
        </button>
      </div>
    </form>
  );
}
