/**
 * Provider verification badges — 5-tier trust system.
 *
 * Badge keys:
 * - id_verified: government ID checked
 * - background_checked: criminal background check passed
 * - top_rated: 4.8+ stars with 20+ reviews
 * - founding_provider: joined during founding period (before 2027-01-01)
 * - pro_verified: completed skills verification
 *
 * All fields are optional/null-safe: providers missing badge columns
 * (migrations not yet applied) simply don't earn those badges.
 */

export const BADGE_KEYS = [
  'id_verified',
  'background_checked',
  'top_rated',
  'founding_provider',
  'pro_verified',
] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];

/** Badge display metadata: icon + styling per badge. */
export const BADGE_META: Record<BadgeKey, { icon: string; className: string }> = {
  id_verified: {
    icon: '✅',
    className: 'bg-blue-100 text-blue-800',
  },
  background_checked: {
    icon: '🛡️',
    className: 'bg-purple-100 text-purple-800',
  },
  top_rated: {
    icon: '⭐',
    className: 'bg-amber-100 text-amber-800',
  },
  founding_provider: {
    icon: '🏆',
    className: 'bg-orange-100 text-orange-800',
  },
  pro_verified: {
    icon: '🔧',
    className: 'bg-emerald-100 text-emerald-800',
  },
};

/** Founding period cutoff: providers created before this date earn the badge. */
export const FOUNDING_CUTOFF = '2027-01-01';

/** Minimum fields the badge logic reads from a provider row. All optional. */
export type BadgeProviderInput = {
  id_verified?: boolean | null;
  background_check_passed?: boolean | null;
  pro_verified?: boolean | null;
  created_at?: string | null;
  rating_avg?: number | null;
  review_count?: number | null;
  // Legacy field: `verified` maps to id_verified when the new column is absent.
  verified?: boolean | null;
};

/**
 * Determine which badges a provider has earned.
 * Never throws — missing data means the badge is simply not earned.
 */
export function getProviderBadges(provider: BadgeProviderInput | null | undefined): BadgeKey[] {
  if (!provider) return [];
  const badges: BadgeKey[] = [];

  try {
    // ID Verified: new column, or legacy `verified` flag as fallback.
    if (provider.id_verified === true || (provider.id_verified == null && provider.verified === true)) {
      badges.push('id_verified');
    }

    // Background Checked
    if (provider.background_check_passed === true) {
      badges.push('background_checked');
    }

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

    // Pro Verified
    if (provider.pro_verified === true) {
      badges.push('pro_verified');
    }
  } catch {
    // Defensive: badge computation must never crash a page.
    return badges;
  }

  return badges;
}
