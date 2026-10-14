import { categories, isCategory, type Category } from './categories';
import { convertCadCents, type Currency } from './currency';

/**
 * Instant-quote estimates. When a listing uses "quote" pricing (no fixed
 * price), we give the customer a ballpark range before they message the
 * provider. Ranges are typical CAD job prices per category, converted to
 * the provider's currency with the app's static rates.
 *
 * These are explicitly labeled as rough estimates — the final price is
 * always agreed with the provider.
 */

/** Typical price range (CAD cents) for a standard/medium job per category. */
const CATEGORY_RANGES: Record<Category, { low: number; high: number }> = {
  cleaning: { low: 12000, high: 25000 },
  handyman: { low: 8000, high: 20000 },
  plumbing: { low: 15000, high: 40000 },
  electrical: { low: 15000, high: 40000 },
  tutoring: { low: 3000, high: 6000 },
  caregiving: { low: 2500, high: 4500 },
  beauty: { low: 4000, high: 12000 },
  massage: { low: 7000, high: 15000 },
  fitness: { low: 4000, high: 10000 },
  cooking: { low: 6000, high: 18000 },
  tech: { low: 6000, high: 20000 },
  moving: { low: 20000, high: 60000 },
  yard: { low: 8000, high: 25000 },
  errands: { low: 2000, high: 6000 },
  other: { low: 5000, high: 15000 },
  // Renovation & trades (typical CAD job prices)
  drafting: { low: 15000, high: 80000 },
  home_renovation: { low: 500000, high: 5000000 },
  basement_renovation: { low: 300000, high: 2500000 },
  cabinetry: { low: 20000, high: 150000 },
  bathroom_renovation: { low: 80000, high: 600000 },
  window_glass_cleaning: { low: 12000, high: 40000 },
  led_lighting: { low: 50000, high: 300000 },
  solar_install: { low: 800000, high: 3000000 },
  sealants: { low: 8000, high: 30000 },
  // Marketplace & rentals (typical CAD prices)
  buy_sell: { low: 1000, high: 50000 },
  room_rentals: { low: 40000, high: 90000 },
  house_rent: { low: 150000, high: 350000 },
  basement_suite: { low: 80000, high: 160000 },
  apartment_condo: { low: 100000, high: 250000 },
  locksmith: { low: 7500, high: 30000 },
  flower_shop: { low: 3000, high: 20000 },
  // Digital services (typical CAD project prices)
  content_creator: { low: 5000, high: 30000 },
  web_developer: { low: 50000, high: 500000 },
  app_developer: { low: 100000, high: 1000000 },
};

export type JobSize = 'small' | 'medium' | 'large';

const SIZE_MULTIPLIERS: Record<JobSize, number> = {
  small: 0.7,
  medium: 1.0,
  large: 1.6,
};

function roundToNice(cents: number): number {
  // Round to a friendly number: nearest $5 above $50, nearest $1 below.
  if (cents >= 5000) return Math.round(cents / 500) * 500;
  return Math.round(cents / 100) * 100;
}

/**
 * Estimate range for "quote"-priced listings, in the provider's currency.
 * Returns null for unknown categories.
 */
export function estimateQuoteRange(
  category: string,
  jobSize: JobSize,
  currency: Currency,
): { low: number; high: number } | null {
  if (!isCategory(category)) return null;
  const base = CATEGORY_RANGES[category as Category];
  const mult = SIZE_MULTIPLIERS[jobSize];
  const low = convertCadCents(Math.round(base.low * mult), currency);
  const high = convertCadCents(Math.round(base.high * mult), currency);
  return { low: roundToNice(low), high: roundToNice(high) };
}

/**
 * Estimate range for hourly listings: rate × hours ± 15%.
 * `hourlyRateCents` is already denominated in the listing's currency.
 */
export function estimateHourlyRange(
  hourlyRateCents: number,
  hours: number,
): { low: number; high: number } {
  const mid = hourlyRateCents * hours;
  return {
    low: roundToNice(Math.round(mid * 0.85)),
    high: roundToNice(Math.round(mid * 1.15)),
  };
}

export function isJobSize(value: string): value is JobSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

// Re-export so the category list stays a single source of truth.
export { categories };
