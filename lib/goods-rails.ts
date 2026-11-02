/**
 * lib/goods-rails.ts — goods marketplace category rails (Phase A, Oct 31 2026)
 *
 * The goods marketplace posts ONLY on rails. Everything else is either a
 * narrow service rail or hidden entirely.
 *
 * - HIDDEN_CATEGORIES: never selectable in the posting form, rejected
 *   server-side with 422. These are the categories the launch scope
 *   excludes (rentals, licensed trades, caregiving, digital services…).
 * - GOODS_SUB_RAILS: the only permitted sub-rails for `buy_sell`
 *   listings. They replace the old sale-type subcategories.
 * - NARROW_SERVICE_CATEGORIES: existing categories allowed as narrow
 *   services at posting (`errands` today; `snow_manual` / `odd_jobs`
 *   arrive as new categories in Phase A-1b).
 *
 * Server enforcement lives in app/api/provider/listings/route.ts;
 * the form filter lives in components/provider/ListingForm.tsx.
 */

import { categoryGroups } from './categories';

/**
 * Categories that can never be posted (launch scope exclusion).
 * Server returns 422; the form never shows them as options.
 */
export const HIDDEN_CATEGORIES = [
  'plumbing',
  'electrical',
  'caregiving',
  'massage',
  'legal_services',
  'insurance',
  'mortgage_brokerage',
  'locksmith',
  'solar_install',
  'room_rentals',
  'house_rent',
  'basement_suite',
  'apartment_condo',
  'drafting',
  'home_renovation',
  'basement_renovation',
  'cabinetry',
  'bathroom_renovation',
  'led_lighting',
  'sealants',
  'content_creator',
  'web_developer',
  'app_developer',
  'flower_shop',
] as const;

export type HiddenCategory = (typeof HIDDEN_CATEGORIES)[number];

export function isHiddenCategory(value: string): boolean {
  return (HIDDEN_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Permitted sub-rails for `buy_sell` (goods) listings.
 * Labels live in the `Subcategories` i18n namespace (same as other
 * subcategories); English fallback in non-English locales per the
 * existing convention.
 */
export const GOODS_SUB_RAILS = [
  'furniture',
  'appliances',
  'home_decor',
  'garden',
  'tools',
  'outdoor',
  'sports',
  'toys',
  'books',
  'music',
  'crafts',
] as const;

export type GoodsSubRail = (typeof GOODS_SUB_RAILS)[number];

export function isGoodsSubRail(value: string): value is GoodsSubRail {
  return (GOODS_SUB_RAILS as readonly string[]).includes(value);
}

/** Existing categories usable as narrow services at posting. */
export const NARROW_SERVICE_CATEGORIES = ['errands'] as const;

export function isNarrowServiceCategory(value: string): boolean {
  return (NARROW_SERVICE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Category groups with hidden categories removed — the only options the
 * posting form may render. Groups left empty are dropped.
 */
export function visibleCategoryGroups() {
  return categoryGroups
    .map((g) => ({
      ...g,
      categories: g.categories.filter((c) => !isHiddenCategory(c)),
    }))
    .filter((g) => g.categories.length > 0);
}
