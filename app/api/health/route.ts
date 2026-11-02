/**
 * Health check. Used by hosting monitors and the founder's
 * "is it alive?" test. Reports liveness plus, per integration,
 * whether it is configured (env present) — names and booleans only,
 * never values (reconnaissance hygiene).
 */
export async function GET() {
  const has = (name: string) => Boolean(process.env[name]?.trim());
  return Response.json({
    ok: true,
    integrations: {
      supabase: has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      supabaseServiceRole: has('SUPABASE_SERVICE_ROLE_KEY'),
      stripe: has('STRIPE_SECRET_KEY'),
      stripeWebhook: has('STRIPE_WEBHOOK_SECRET'),
      stripePrices:
        has('STRIPE_PRICE_PRO_MONTHLY') &&
        has('STRIPE_PRICE_BUSINESS_MONTHLY') &&
        has('STRIPE_PRICE_BOOST'),
      stripeTestMode: process.env.STRIPE_TEST_MODE !== 'false',
      serviceBookingLive: process.env.SERVICE_BOOKING_LIVE === 'true',
      // Two-tier launch (Oct 21, 2026): both provider tiers ship with
      // this build; the tier column itself is migration 0052 (owner
      // step) and the app degrades safely before it is applied.
      providerTiersLive: process.env.PROVIDER_TIERS_LIVE !== 'false',
      providerShopLive: process.env.PROVIDER_SHOP_LIVE === 'true',
      turnstile: has('TURNSTILE_SECRET_KEY') && has('NEXT_PUBLIC_TURNSTILE_SITE_KEY'),
      paypal: has('PAYPAL_CLIENT_ID') && has('PAYPAL_SECRET'),
      tidio: true, // public key is embedded in the root layout (not env)
    },
  });
}
