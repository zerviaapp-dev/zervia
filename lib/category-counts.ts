import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public-client';

/**
 * Active-listing counts per category, for the public category cards.
 *
 * Category cards carry an indicative "from $X" badge. That badge must
 * never appear as a real starting price for a category that currently
 * has no active listings (finding Z4, Oct 23, 2026), so the homepage
 * and services pages fetch these counts and suppress the badge where
 * the count is zero.
 *
 * Returns null when Supabase is unconfigured or the query fails —
 * callers then fall back to showing the badge (the pre-fix behaviour)
 * rather than hiding prices on a guess. Counts are computed from the
 * listings table with the same `status = 'active'` filter Discover
 * uses. (PostgREST's default 1000-row cap is far above current volume;
 * revisit with a grouped count query if listings ever approach it.)
 *
 * Oct 23, 2026 (Fast Origin Transfer fix): the query now runs through
 * the cookie-free public client and is cached for 5 minutes via
 * `unstable_cache`. The previous version used the cookie-based server
 * client on every render, which forced the homepage and services pages
 * dynamic (no edge cache) and burned the Vercel free-tier origin
 * transfer allowance. Listings are public data, so a 5-minute-old count
 * is fine — worst case a brand-new category's badge lags a few minutes.
 */
const fetchActiveListingCounts = unstable_cache(
  async (): Promise<[string, number][] | null> => {
    try {
      const supabase = createPublicClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('listings')
        .select('category')
        .eq('status', 'active');
      if (error || !data) return null;
      const counts = new Map<string, number>();
      for (const row of data as { category: string }[]) {
        counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
      }
      return [...counts.entries()];
    } catch {
      return null;
    }
  },
  ['active-listing-counts-v1'],
  { revalidate: 300, tags: ['listings'] }
);

export async function getActiveListingCounts(): Promise<Map<string, number> | null> {
  const entries = await fetchActiveListingCounts();
  return entries ? new Map(entries) : null;
}

/** True when the price badge may be shown: counts unknown, or the category has active listings. */
export function categoryHasListings(
  counts: Map<string, number> | null,
  category: string
): boolean {
  return counts === null || (counts.get(category) ?? 0) > 0;
}
