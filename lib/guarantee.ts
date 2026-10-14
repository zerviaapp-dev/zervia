/**
 * First-Session Guarantee — eligibility helpers.
 *
 * The guarantee ("Don't love your first session with a new provider?
 * It's on us.") applies to categories where personal "fit" matters most:
 * learning, beauty/wellness, and personal services.
 *
 * Machine keys only — labels live in the `Guarantee` i18n namespace.
 */

/** Categories covered by the First-Session Guarantee. */
export const GUARANTEE_CATEGORIES = [
  'tutoring',
  'beauty',
  'massage',
  'fitness',
  'caregiving',
  'cooking',
] as const;

export type GuaranteeCategory = (typeof GUARANTEE_CATEGORIES)[number];

/** True when the category is covered by the First-Session Guarantee. */
export function isGuaranteeCategory(category: string): boolean {
  return (GUARANTEE_CATEGORIES as readonly string[]).includes(category);
}

/** Claim window in hours after the session is completed. */
export const GUARANTEE_CLAIM_WINDOW_HOURS = 48;

/**
 * One guarantee claim per customer per category — prevents serial abuse
 * while letting customers try new categories risk-free.
 */
export const GUARANTEE_MAX_CLAIMS_PER_CATEGORY = 1;
