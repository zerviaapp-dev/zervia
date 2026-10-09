/**
 * Zervia pricing constants (Phase 5 — Money).
 *
 * All money is integer cents, matching the database convention.
 * Stripe Price IDs live in environment variables (see .env.example);
 * the amounts here MUST match the products created in the Stripe
 * dashboard (supabase/stripe-setup.md). The app never trusts these
 * numbers for charging — Stripe is the source of truth at checkout;
 * these constants drive display and the points-economy bridge.
 */

export const PRO_MONTHLY_CENTS = 1900; // $19/mo
export const PRO_YEARLY_CENTS = 19000; // $190/yr
export const BUSINESS_MONTHLY_CENTS = 4900; // $49/mo
export const BUSINESS_YEARLY_CENTS = 49000; // $490/yr
export const BOOST_CENTS = 900; // $9 one-time, 7-day featured boost

/** Featured boost duration in days. */
export const BOOST_DAYS = 7;

/** One-time purchases (Phase 5+ — no subscription needed). */
export const VERIFICATION_BADGE_CENTS = 2900; // $29 one-time, badge lasts forever
export const FEATURED_WEEK_CENTS = 1500; // $15 one-time, 7-day top placement
export const PROFILE_SPOTLIGHT_CENTS = 1900; // $19 one-time, 7-day profile spotlight

/** Featured week / spotlight durations in days. */
export const FEATURED_WEEK_DAYS = 7;
export const SPOTLIGHT_DAYS = 7;

export type Tier = 'starter' | 'pro' | 'business';
export type BillingInterval = 'month' | 'year';

/** Price-ID env names for each tier × interval (set in Stripe dashboard). */
export const PRICE_ENV: Record<Exclude<Tier, 'starter'>, Record<BillingInterval, string>> = {
  pro: { month: 'STRIPE_PRICE_PRO_MONTHLY', year: 'STRIPE_PRICE_PRO_YEARLY' },
  business: { month: 'STRIPE_PRICE_BUSINESS_MONTHLY', year: 'STRIPE_PRICE_BUSINESS_YEARLY' },
};

/** Display amount for a tier × interval. */
export function tierPriceCents(tier: Exclude<Tier, 'starter'>, interval: BillingInterval): number {
  if (tier === 'pro') return interval === 'month' ? PRO_MONTHLY_CENTS : PRO_YEARLY_CENTS;
  return interval === 'month' ? BUSINESS_MONTHLY_CENTS : BUSINESS_YEARLY_CENTS;
}

/** "$19" / "$19.50" — display only, never used for charging. */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * Lead fees per booking, in cents, by listing category.
 * DEFAULT IS ZERO — the founding period is free, per the approved plan.
 * The founder raises these per category when providers are getting value.
 * Keys are lowercase category ids (see lib/categories.ts); unknown
 * categories fall back to DEFAULT_LEAD_FEE_CENTS.
 */
export const DEFAULT_LEAD_FEE_CENTS = 0;

export const LEAD_FEE_CENTS_BY_CATEGORY: Record<string, number> = {
  // e.g. plumbing: 200,  // $2.00 per confirmed booking — NOT enabled yet
};

/**
 * Master switch for lead-fee collection. FALSE = fees accrue visibly on
 * the billing page (transparency) but nothing is ever charged.
 * Flip to true only when the founder explicitly approves going live.
 */
export const LEAD_FEE_COLLECTION_ENABLED = false;

export function leadFeeCentsFor(category: string): number {
  const key = category.toLowerCase();
  return LEAD_FEE_CENTS_BY_CATEGORY[key] ?? DEFAULT_LEAD_FEE_CENTS;
}

/**
 * Test mode banner switch. TRUE (default) = the billing pages show a
 * "TEST MODE" badge and every Stripe call uses test keys. The founder
 * flips STRIPE_TEST_MODE=false in .env.local only when real money
 * should move.
 */
export function isTestMode(): boolean {
  return process.env.STRIPE_TEST_MODE !== 'false';
}
