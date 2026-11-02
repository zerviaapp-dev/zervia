'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Dashboard 2.0 browse filters — Category + Sort selects for the services rail.
 * Tiny client island: updates the page's own search params (no new routes,
 * no data mutation). Everything it offers is a real server-side filter.
 */
export function BrowseFilters({
  dashboardPath,
  categoryLabel,
  allCategoriesLabel,
  sortLabel,
  sortNewestLabel,
  sortOldestLabel,
  categories,
  categoryName,
}: {
  dashboardPath: string;
  categoryLabel: string;
  allCategoriesLabel: string;
  sortLabel: string;
  sortNewestLabel: string;
  sortOldestLabel: string;
  categories: readonly string[];
  categoryName: (cat: string) => string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const activeCategory = params.get('category') ?? '';
  // Validate against the real options: a tampered ?sort= value must not
  // desync the select from the server-side sort (which defaults to newest).
  const activeSort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    // A manual category pick replaces the chip preset — they are two
    // views of the same filter, never stacked.
    if (next.category !== undefined) sp.delete('chip');
    const qs = sp.toString();
    router.push(qs ? `${dashboardPath}?${qs}` : dashboardPath);
  }

  const selectCls =
    'inline-flex min-h-[44px] items-center rounded-full border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-800 focus:border-brand-500 focus:outline-none';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="dash2-category">
        {categoryLabel}
      </label>
      <select
        id="dash2-category"
        aria-label={categoryLabel}
        className={selectCls}
        value={activeCategory}
        onChange={(e) => update({ category: e.target.value })}
      >
        <option value="">{allCategoriesLabel}</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {categoryName(c)}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="dash2-sort">
        {sortLabel}
      </label>
      <select
        id="dash2-sort"
        aria-label={sortLabel}
        className={selectCls}
        value={activeSort}
        onChange={(e) => update({ sort: e.target.value })}
      >
        <option value="newest">{sortNewestLabel}</option>
        <option value="oldest">{sortOldestLabel}</option>
      </select>
    </div>
  );
}
