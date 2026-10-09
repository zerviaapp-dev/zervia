import Stripe from 'stripe';
import type { Currency } from './currency';
import { DEFAULT_CURRENCY } from './currency';

/**
 * Whether the Stripe secret key is present. The app renders friendly
 * "payments not connected yet" states when false, so `next build` and
 * the UI never crash before the founder's Stripe setup.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let stripeInstance: Stripe | null = null;

/**
 * Server-side Stripe client. NEVER import this in a client component —
 * the secret key must never reach the browser. Throws a clear error when
 * unconfigured so misconfiguration fails loudly in server code, while
 * pages still render their graceful fallback via isStripeConfigured().
 */
export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured: STRIPE_SECRET_KEY is missing.');
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-09-30.endive',
      typescript: true,
    });
  }
  return stripeInstance;
}

/**
 * Price ID for a tier × interval × currency, read from env.
 *
 * Per-currency price IDs are optional: set STRIPE_PRICE_PRO_MONTHLY_USD
 * (etc.) in the Stripe dashboard + Vercel env when that currency goes
 * live. When no currency-specific price exists we fall back to the base
 * CAD price — Stripe then charges in CAD and the buyer sees CAD at
 * checkout. Display code converts the CAD base for other currencies.
 */
export function priceIdFor(
  tier: 'pro' | 'business',
  interval: 'month' | 'year',
  currency: Currency = DEFAULT_CURRENCY
): string | null {
  const base =
    tier === 'pro'
      ? interval === 'month'
        ? 'STRIPE_PRICE_PRO_MONTHLY'
        : 'STRIPE_PRICE_PRO_YEARLY'
      : interval === 'month'
        ? 'STRIPE_PRICE_BUSINESS_MONTHLY'
        : 'STRIPE_PRICE_BUSINESS_YEARLY';
  if (currency !== 'cad') {
    const localized = process.env[`${base}_${currency.toUpperCase()}`];
    if (localized) return localized;
  }
  return process.env[base] ?? null;
}

/**
 * Price ID for the one-time featured boost (CAD base = $9).
 * Per-currency override: STRIPE_PRICE_BOOST_USD / _PHP.
 */
export function boostPriceId(currency: Currency = DEFAULT_CURRENCY): string | null {
  if (currency !== 'cad') {
    const localized = process.env[`STRIPE_PRICE_BOOST_${currency.toUpperCase()}`];
    if (localized) return localized;
  }
  return process.env.STRIPE_PRICE_BOOST ?? null;
}

/**
 * Price ID for the one-time verification badge (CAD base = $29).
 * Per-currency override: STRIPE_PRICE_VERIFICATION_BADGE_USD / _PHP.
 */
export function verificationBadgePriceId(currency: Currency = DEFAULT_CURRENCY): string | null {
  if (currency !== 'cad') {
    const localized = process.env[`STRIPE_PRICE_VERIFICATION_BADGE_${currency.toUpperCase()}`];
    if (localized) return localized;
  }
  return process.env.STRIPE_PRICE_VERIFICATION_BADGE ?? null;
}

/**
 * Price ID for the one-time featured week (CAD base = $15).
 * Per-currency override: STRIPE_PRICE_FEATURED_WEEK_USD / _PHP.
 */
export function featuredWeekPriceId(currency: Currency = DEFAULT_CURRENCY): string | null {
  if (currency !== 'cad') {
    const localized = process.env[`STRIPE_PRICE_FEATURED_WEEK_${currency.toUpperCase()}`];
    if (localized) return localized;
  }
  return process.env.STRIPE_PRICE_FEATURED_WEEK ?? null;
}

/**
 * Price ID for the one-time profile spotlight (CAD base = $19).
 * Per-currency override: STRIPE_PRICE_PROFILE_SPOTLIGHT_USD / _PHP.
 */
export function profileSpotlightPriceId(currency: Currency = DEFAULT_CURRENCY): string | null {
  if (currency !== 'cad') {
    const localized = process.env[`STRIPE_PRICE_PROFILE_SPOTLIGHT_${currency.toUpperCase()}`];
    if (localized) return localized;
  }
  return process.env.STRIPE_PRICE_PROFILE_SPOTLIGHT ?? null;
}
