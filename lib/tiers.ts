/**
 * Provider growth tiers. Maps the Phase-1 `trust_level` ladder
 * (new → verified → trusted → top_rated) onto growth-tier branding
 * with job-count thresholds and real perks.
 *
 * Thresholds are the source of truth for: tier display, progress bars,
 * and Featured Boost eligibility (Rising+ = 10 completed jobs).
 */

export type TrustLevel = 'new' | 'verified' | 'trusted' | 'top_rated';

export type Tier = {
  /** trust_level value */
  level: TrustLevel;
  /** i18n key under the "Tiers" namespace */
  nameKey: string;
  /** i18n key for the tier description */
  descKey: string;
  /** completed jobs needed to REACH this tier */
  minJobs: number;
  /** minimum average rating to reach this tier (null = no requirement) */
  minRating: number | null;
  /** i18n keys for the tier's perks */
  perkKeys: string[];
};

export const TIERS: Tier[] = [
  {
    level: 'new',
    nameKey: 'tierNew',
    descKey: 'tierNewDesc',
    minJobs: 0,
    minRating: null,
    perkKeys: ['perkListings', 'perkBookings'],
  },
  {
    level: 'verified',
    nameKey: 'tierRising',
    descKey: 'tierRisingDesc',
    minJobs: 10,
    minRating: null,
    perkKeys: ['perkListings', 'perkBookings', 'perkBoost', 'perkRisingBadge'],
  },
  {
    level: 'trusted',
    nameKey: 'tierEstablished',
    descKey: 'tierEstablishedDesc',
    minJobs: 50,
    minRating: 4.5,
    perkKeys: [
      'perkListings',
      'perkBookings',
      'perkBoost',
      'perkPriorityRank',
      'perkEstablishedBadge',
    ],
  },
  {
    level: 'top_rated',
    nameKey: 'tierTopRated',
    descKey: 'tierTopRatedDesc',
    minJobs: 100,
    minRating: 4.8,
    perkKeys: [
      'perkListings',
      'perkBookings',
      'perkBoost',
      'perkPriorityRank',
      'perkTopSpotlight',
      'perkTopRatedBadge',
    ],
  },
];

/** Featured Boost requires the Rising tier (10 completed jobs). */
export const BOOST_MIN_JOBS = 10;

export function tierFor(level: TrustLevel): Tier {
  return TIERS.find((t) => t.level === level) ?? TIERS[0];
}

export function nextTier(level: TrustLevel): Tier | null {
  const idx = TIERS.findIndex((t) => t.level === level);
  return idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

/**
 * Progress (0–1) toward the next tier based on completed jobs.
 * Returns 1 when already at the top tier.
 */
export function tierProgress(
  level: TrustLevel,
  completedJobs: number
): { next: Tier | null; progress: number; jobsToGo: number } {
  const next = nextTier(level);
  if (!next) return { next: null, progress: 1, jobsToGo: 0 };
  const current = tierFor(level);
  const span = Math.max(next.minJobs - current.minJobs, 1);
  const done = Math.min(Math.max(completedJobs - current.minJobs, 0), span);
  return {
    next,
    progress: done / span,
    jobsToGo: Math.max(next.minJobs - completedJobs, 0),
  };
}

/** True when the provider may purchase a Featured Boost. */
export function boostEligible(completedJobs: number): boolean {
  return completedJobs >= BOOST_MIN_JOBS;
}
