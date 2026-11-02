'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import {
  buildSuggestions,
  type Suggestion,
} from '@/lib/search-suggestions';
import type { Category } from '@/lib/categories';

const CATEGORY_ICONS: Partial<Record<Category, string>> = {
  cleaning: '🧹',
  handyman: '🔧',
  plumbing: '🚿',
  electrical: '⚡',
  tutoring: '📚',
  caregiving: '🤝',
  beauty: '💅',
  massage: '💆',
  fitness: '💪',
  cooking: '🍳',
  tech: '💻',
  moving: '📦',
  yard: '🌱',
  errands: '🛒',
};

/**
 * Search box with live type-ahead suggestions (Liz, Oct 20, 2026:
 * "while customer type, should show up").
 *
 * As the customer types, a drop-down shows — without pressing Search:
 *   🔍 Search for "<text>"
 *   📚 Tutoring                     (matching category)
 *   ↳ Math · Tutoring               (its service types)
 *   💬 "math tutor" · Tutoring      (plain-language phrases)
 * Picking a category / service type goes straight to that filtered
 * Discover view (the partial typed text is dropped — keeping it would
 * re-filter the results by the half-typed word and hide listings).
 * Enter / Search keeps the classic free-text search.
 *
 * `preserved` params (scope, urgency, price, sort…) are carried through
 * every navigation, exactly like the filter forms on Discover.
 */
export function SearchAutocomplete({
  initialQuery = '',
  placeholder,
  searchButtonLabel,
  preserved = {},
  inputClassName = 'auth-input min-h-[56px] flex-1 rounded-2xl px-4 text-base',
  idPrefix = 'search-autocomplete',
}: {
  initialQuery?: string;
  placeholder: string;
  searchButtonLabel: string;
  preserved?: Record<string, string | undefined>;
  inputClassName?: string;
  idPrefix?: string;
}) {
  const router = useRouter();
  const tc = useTranslations('Categories');
  const ts = useTranslations('Subcategories');
  const td = useTranslations('Discover');
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const suggestions: Suggestion[] = useMemo(
    () =>
      buildSuggestions(query, {
        categoryLabel: (c) => {
          try {
            return tc(c);
          } catch {
            return c;
          }
        },
        subcategoryLabel: (_c, s) => {
          try {
            return ts(s as 'math_tutoring');
          } catch {
            return s;
          }
        },
      }),
    [query, tc, ts],
  );

  const showDropdown = open && suggestions.length > 0;

  function hrefFor(s: Suggestion): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(preserved)) {
      if (v) params.set(k, v);
    }
    if (s.kind === 'category') {
      params.delete('q');
      params.delete('subcategory');
      params.set('category', s.category);
    } else if (s.kind === 'subcategory') {
      params.delete('q');
      params.set('category', s.category);
      params.set('subcategory', s.subcategory);
    } else if (s.kind === 'phrase') {
      params.set('q', s.phrase);
    } else {
      params.set('q', s.query);
    }
    const qs = params.toString();
    return `/discover${qs ? `?${qs}` : ''}`;
  }

  function go(s: Suggestion) {
    setOpen(false);
    router.push(hrefFor(s));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (showDropdown && suggestions[highlight]) {
      go(suggestions[highlight]);
      return;
    }
    const trimmed = query.trim();
    go({ kind: 'search', id: 'search', query: trimmed });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && showDropdown) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && showDropdown) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function rowLabel(s: Suggestion): { main: string; sub?: string; icon: string } {
    switch (s.kind) {
      case 'search':
        return { main: `${td('searchButton')}: “${s.query}”`, icon: '🔍' };
      case 'category':
        return {
          main: s.label,
          sub: td('browseCategories'),
          icon: CATEGORY_ICONS[s.category] ?? '✨',
        };
      case 'subcategory':
        return { main: s.label, sub: `${s.categoryLabel} · ${td('subcategoryLabel')}`, icon: '↳' };
      case 'phrase':
        return { main: `“${s.phrase}”`, sub: s.categoryLabel, icon: '💬' };
    }
  }

  return (
    <form onSubmit={submit} role="search" className="relative flex gap-2">
      <div className="relative min-w-0 flex-1">
        <label htmlFor={`${idPrefix}-q`} className="sr-only">
          {placeholder}
        </label>
        <input
          ref={inputRef}
          id={`${idPrefix}-q`}
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-activedescendant={
            showDropdown ? `${listId}-${highlight}` : undefined
          }
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a tap/click on a row registers first.
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          className={`${inputClassName} w-full`}
        />
        {showDropdown ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={placeholder}
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border-2 border-brand-100 bg-white shadow-xl"
          >
            {suggestions.map((s, i) => {
              const { main, sub, icon } = rowLabel(s);
              return (
                <li
                  key={s.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(s);
                  }}
                  className={`flex min-h-[48px] cursor-pointer items-center gap-3 px-4 py-2 ${
                    i === highlight ? 'bg-brand-50' : 'bg-white'
                  }`}
                >
                  <span aria-hidden="true" className="text-lg">
                    {icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-brand-900">
                      {main}
                    </span>
                    {sub ? (
                      <span className="block truncate text-xs text-brand-500">
                        {sub}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <button
        type="submit"
        className="inline-flex min-h-[56px] shrink-0 items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700"
      >
        {searchButtonLabel}
      </button>
    </form>
  );
}
