/**
 * Connector-model feature flags (affiliate-only pivot, Oct 20, 2026).
 *
 * SERVICE_BOOKING_LIVE — master switch for Zervia's first-party service
 * booking flow (booking forms, escrow checkout, Stripe Connect provider
 * payouts, guarantee claims). Default OFF: only the literal string
 * "true" enables it, and enabling it outside the documented re-entry
 * gate (lawyer opinion + insurance + staffed dispute process + founder
 * GO — see strategy/zervia-marketplace-affiliate-decision-plan-2026-10-20.md)
 * is a defect. While off, booking/escrow code stays in the repo dormant;
 * routes return 403 and surfaces render the connector layout instead.
 *
 * Server-side only — client components must receive the boolean as a
 * server-rendered prop, never read env in the browser.
 */
export function isServiceBookingLive(): boolean {
  return process.env.SERVICE_BOOKING_LIVE === 'true';
}

/**
 * BILLING_LIVE — master switch for Zervia's OWN charges (provider
 * subscriptions + featured boosts via Stripe/PayPal checkout).
 * Default OFF (Stage A, Oct 20, 2026 — Liz's "both, in sequence"
 * decision on MAJ-2): the founding period is free, pricing pages show
 * prices with honest founding copy, and every buy/upgrade button is
 * disabled. Flip to "true" ONLY as part of Stage B: live Stripe keys
 * in env (sk_live_…), STRIPE_TEST_MODE=false, live price IDs set, a
 * live webhook secret in place, and a real charge → cancel → refund
 * verified end-to-end. While off, checkout components stay dormant —
 * never point a public button at test-mode checkout.
 */
export function isBillingLive(): boolean {
  return process.env.BILLING_LIVE === 'true';
}

/**
 * PROVIDER_SHOP_LIVE — master switch for the first-party checkout of
 * PROVIDER physical goods (third-party fulfilment). Default OFF under
 * the same connector discipline. Zervia's OWN digital catalogue
 * (lib/digital-products.ts) is never gated by this flag.
 */
export function isProviderShopLive(): boolean {
  return process.env.PROVIDER_SHOP_LIVE === 'true';
}

/**
 * DIGITAL_PRODUCTS_LIVE — master switch for Zervia's OWN digital
 * catalogue (lib/digital-products.ts: ebooks, language/trades courses,
 * guides and programs). Default OFF since Oct 22, 2026 — Liz's
 * cross-platform hold: items of the type prohibited under Etsy's
 * Oct 22, 2026 AI policy (AI-generated functional guides/courses)
 * are not to be sold on Zervia either; the Etsy hold is not to be
 * routed around by selling the same products here. While off, the
 * /products listing and digital detail pages render a paused notice
 * and /api/stripe/digital-checkout returns 403. The catalogue data
 * stays in the repo and the buyer Library keeps working — existing
 * buyers keep access to what they bought. Flip to "true" ONLY after
 * an independent person can vouch for / verify these products AND
 * Liz gives an explicit GO.
 */
export function isDigitalProductsLive(): boolean {
  return process.env.DIGITAL_PRODUCTS_LIVE === 'true';
}
