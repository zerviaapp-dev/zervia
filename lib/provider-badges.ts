/**
 * Provider badges — factual, non-verification tiers only (D3/D4, Oct 30 2026).
 *
 * REMOVED (P0 risk removal): the identity, background-check, and pro
 * verification tiers. Zervia makes no verification claims about providers — no identity,
 * background, insurance, or skills verification is asserted anywhere
 * customer-facing. Every services surface states plainly:
 * "Zervia does not verify provider credentials, insurance, or background."
 *
 * Remaining badge keys (factual only):
 * - top_rated: 4.8+ stars with 20+ reviews (rating fact, from completed-booking reviews)
 * - founding_provider: joined during founding period (before 2027-01-01) (tenure fact)
 */

export const BADGE_KEYS = ['top_rated', 'founding_provider'] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];

/** Badge display metadata: icon + styling per badge. */
export const BADGE_META: Record<BadgeKey, { icon: string; className: string }> = {
  top_rated: {
    icon: '⭐',
    className: 'bg-amber-100 text-amber-800',
  },
  founding_provider: {
    icon: '🏆',
    className: 'bg-orange-100 text-orange-800',
  },
};

/** Founding period cutoff: providers created before this date earn the badge. */
export const FOUNDING_CUTOFF = '2027-01-01';

/** Minimum fields the badge logic reads from a provider row. All optional. */
export type BadgeProviderInput = {
  created_at?: string | null;
  rating_avg?: number | null;
  review_count?: number | null;
};

/**
 * Determine which badges a provider has earned.
 * Never throws — missing data means the badge is simply not earned.
 */
export function getProviderBadges(provider: BadgeProviderInput | null | undefined): BadgeKey[] {
  if (!provider) return [];
  const badges: BadgeKey[] = [];

  try {
    // Top Rated: 4.8+ average with 20+ reviews.
    const avg = typeof provider.rating_avg === 'number' ? provider.rating_avg : null;
    const count = typeof provider.review_count === 'number' ? provider.review_count : null;
    if (avg !== null && count !== null && avg >= 4.8 && count >= 20) {
      badges.push('top_rated');
    }

    // Founding Provider: created before the cutoff.
    if (provider.created_at) {
      const created = new Date(provider.created_at);
      if (!Number.isNaN(created.getTime()) && created < new Date(FOUNDING_CUTOFF)) {
        badges.push('founding_provider');
      }
    }
  } catch {
    // Defensive: badge computation must never crash a page.
    return badges;
  }

  return badges;
}
