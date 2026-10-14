/**
 * Smart pricing suggestions for provider listings.
 *
 * When a provider creates or edits a listing, we show a hint like
 * "Similar providers charge $50–$150" based on the listing's category
 * and country. These are guidance ranges, not mandates — the provider
 * always sets their own price.
 *
 * Base ranges are in CAD cents (typical job/session rates observed for
 * each category). A country cost tier scales the range: high-cost
 * countries pay ~1x, mid ~0.6x, low ~0.3x. Unknown countries fall back
 * to the mid tier.
 */

export type CostTier = 'high' | 'mid' | 'low';

/** Country → cost tier. Anything not listed falls back to 'mid'. */
const COUNTRY_TIERS: Record<string, CostTier> = {};

const HIGH_TIER = new Set([
  'CA', 'US', 'GB', 'AU', 'NZ', 'IE', 'CH', 'NO', 'DK', 'SE', 'FI',
  'NL', 'BE', 'AT', 'DE', 'FR', 'AE', 'QA', 'KW', 'BH', 'SA', 'OM',
  'SG', 'HK', 'JP', 'KR', 'TW', 'IL',
]);

const LOW_TIER = new Set([
  'PH', 'IN', 'PK', 'NG', 'GH', 'KE', 'VN', 'ID', 'BD', 'LK', 'NP',
  'ET', 'UG', 'TZ', 'ZM',
]);

for (const code of HIGH_TIER) COUNTRY_TIERS[code] = 'high';
for (const code of LOW_TIER) COUNTRY_TIERS[code] = 'low';

const TIER_FACTOR: Record<CostTier, number> = {
  high: 1,
  mid: 0.6,
  low: 0.3,
};

export function costTierForCountry(countryCode: string): CostTier {
  return COUNTRY_TIERS[countryCode?.toUpperCase()] ?? 'mid';
}

/**
 * Typical price range per category, in CAD cents.
 * [min, max] covers the common band for a standard job/session.
 */
const CATEGORY_RANGES_CAD: Record<string, [number, number]> = {
  cleaning: [2500, 6000], // $25–$60 (often hourly)
  handyman: [4000, 9000], // $40–$90
  plumbing: [7500, 18000], // $75–$180
  electrical: [7500, 18000], // $75–$180
  tutoring: [2000, 6000], // $20–$60/hr
  caregiving: [1800, 3500], // $18–$35/hr
  beauty: [3000, 12000], // $30–$120
  massage: [6000, 14000], // $60–$140
  fitness: [3000, 9000], // $30–$90/session
  cooking: [2500, 7000], // $25–$70
  tech: [4000, 12000], // $40–$120
  moving: [6000, 15000], // $60–$150
  yard: [3000, 8000], // $30–$80
  errands: [1500, 4500], // $15–$45
  other: [2000, 8000], // $20–$80
};

export type PriceSuggestion = {
  minCents: number;
  maxCents: number;
  midCents: number;
  tier: CostTier;
};

/** Round to a "nice" number: nearest $5 for small, nearest $10 for large. */
function roundNice(cents: number): number {
  const dollars = cents / 100;
  if (dollars < 50) return Math.round(dollars / 5) * 5 * 100;
  return Math.round(dollars / 10) * 10 * 100;
}

/**
 * Suggested price range for a category + country.
 * Returns null when the category is unknown (no guidance available).
 */
export function suggestPriceRange(
  category: string,
  countryCode: string
): PriceSuggestion | null {
  const base = CATEGORY_RANGES_CAD[category];
  if (!base) return null;
  const tier = costTierForCountry(countryCode);
  const factor = TIER_FACTOR[tier];
  const minCents = Math.max(100, roundNice(base[0] * factor));
  const maxCents = Math.max(minCents + 500, roundNice(base[1] * factor));
  return {
    minCents,
    maxCents,
    midCents: Math.round((minCents + maxCents) / 2),
    tier,
  };
}
