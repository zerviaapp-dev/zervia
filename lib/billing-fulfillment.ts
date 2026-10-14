import { createAdminClient } from '@/lib/supabase/admin';
import { BOOST_DAYS, FEATURED_WEEK_DAYS, SPOTLIGHT_DAYS } from '@/lib/pricing';

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type OneTimeKind = 'boost' | 'verification_badge' | 'featured_week' | 'profile_spotlight';

/**
 * Shared purchase-fulfillment for non-Stripe payment methods (PayPal).
 *
 * Mirrors the activation logic in app/api/stripe/webhook/route.ts so a
 * PayPal purchase activates exactly the same way a Stripe one does.
 * This module intentionally duplicates (not imports) the Stripe webhook
 * helpers — the Stripe money path is not to be refactored by a
 * parallel payment integration.
 *
 * Migration 0031_paypal.sql adds `payment_method` + `paypal_order_id`
 * columns to transactions. Until it is applied, the PayPal reference
 * rides in the description field and the insert omits the new columns
 * (probed once per process).
 */

let paypalColumnsCache: boolean | null = null;

async function paypalColumnsAvailable(admin: Admin): Promise<boolean> {
  if (paypalColumnsCache !== null) return paypalColumnsCache;
  try {
    const { error } = await admin.from('transactions').select('paypal_order_id').limit(0);
    paypalColumnsCache = !error;
  } catch {
    paypalColumnsCache = false;
  }
  return paypalColumnsCache;
}

export async function recordPayPalTransaction(
  admin: Admin,
  row: {
    user_id: string;
    provider_id?: string | null;
    paypal_order_id?: string | null;
    paypal_capture_id?: string | null;
    amount_cents: number;
    currency?: string;
    type: 'subscription' | 'boost' | 'verification_badge' | 'featured_week' | 'profile_spotlight';
    status: 'pending' | 'succeeded' | 'failed' | 'refunded';
    description?: string | null;
  }
): Promise<void> {
  const hasCols = await paypalColumnsAvailable(admin);
  const base = {
    user_id: row.user_id,
    provider_id: row.provider_id ?? null,
    amount_cents: row.amount_cents,
    currency: row.currency ?? 'cad',
    type: row.type,
    status: row.status,
    description: hasCols
      ? (row.description ?? null)
      : `via PayPal${row.paypal_order_id ? ` (order ${row.paypal_order_id})` : ''}${row.description ? ` — ${row.description}` : ''}`,
  };
  const full = hasCols
    ? {
        ...base,
        payment_method: 'paypal',
        paypal_order_id: row.paypal_order_id ?? null,
        paypal_capture_id: row.paypal_capture_id ?? null,
      }
    : base;
  const { error } = await admin.from('transactions').insert(full);
  if (error) console.error('[paypal] transaction insert failed', error.message);
}

async function activateListingBoost(admin: Admin, listingId: string): Promise<void> {
  const until = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('listings')
    .update({ is_featured: true, featured_until: until, featured_priority: 1 })
    .eq('id', listingId);
  if (error) console.error('[paypal] boost activation failed', error.message);
}

async function activateFeaturedWeek(admin: Admin, listingId: string): Promise<void> {
  const until = new Date(Date.now() + FEATURED_WEEK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('listings')
    .update({ is_featured: true, featured_until: until, featured_priority: 2 })
    .eq('id', listingId);
  if (error) console.error('[paypal] featured-week activation failed', error.message);
}

async function activateVerificationBadge(admin: Admin, providerId: string): Promise<void> {
  const { error } = await admin
    .from('providers')
    .update({ verification_badge: true })
    .eq('id', providerId);
  if (error) console.error('[paypal] verification-badge activation failed', error.message);
}

async function activateProfileSpotlight(admin: Admin, providerId: string): Promise<void> {
  const until = new Date(Date.now() + SPOTLIGHT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('providers')
    .update({ spotlight_until: until })
    .eq('id', providerId);
  if (error) console.error('[paypal] profile-spotlight activation failed', error.message);
}

/**
 * Fulfill a completed one-time PayPal purchase: activate the product
 * and record the transaction. Idempotent for a given paypal order —
 * callers must dedupe on the order id before invoking.
 */
export async function fulfillPayPalOneTimePurchase(
  admin: Admin,
  args: {
    kind: OneTimeKind;
    userId: string;
    providerId: string;
    listingId?: string | null;
    paypalOrderId: string;
    paypalCaptureId?: string | null;
    amountCents: number;
    currency: string;
    description: string;
  }
): Promise<void> {
  const { kind, userId, providerId, listingId, paypalOrderId, paypalCaptureId, amountCents, currency, description } = args;
  switch (kind) {
    case 'boost':
      if (listingId) await activateListingBoost(admin, listingId);
      break;
    case 'featured_week':
      if (listingId) await activateFeaturedWeek(admin, listingId);
      break;
    case 'verification_badge':
      await activateVerificationBadge(admin, providerId);
      break;
    case 'profile_spotlight':
      await activateProfileSpotlight(admin, providerId);
      break;
  }
  await recordPayPalTransaction(admin, {
    user_id: userId,
    provider_id: providerId,
    paypal_order_id: paypalOrderId,
    paypal_capture_id: paypalCaptureId ?? null,
    amount_cents: amountCents,
    currency,
    type: kind,
    status: 'succeeded',
    description,
  });
}

/**
 * Mirror a PayPal subscription locally (created via the Subscriptions
 * API or activated through the webhook). Same shape the Stripe
 * webhook writes, so the rest of the app treats both identically.
 */
export async function upsertPayPalSubscription(
  admin: Admin,
  args: {
    providerId: string;
    userId: string;
    paypalSubscriptionId: string;
    tier: 'pro' | 'business';
    interval: 'month' | 'year';
    status: string;
    nextBillingIso?: string | null;
  }
): Promise<void> {
  const { providerId, userId, paypalSubscriptionId, tier, interval, status, nextBillingIso } = args;
  const { error } = await admin.from('subscriptions').upsert(
    {
      provider_id: providerId,
      user_id: userId,
      stripe_subscription_id: `paypal:${paypalSubscriptionId}`,
      stripe_customer_id: `paypal:${userId}`,
      tier,
      billing_interval: interval,
      status,
      current_period_end: nextBillingIso ?? null,
    },
    { onConflict: 'provider_id' }
  );
  if (error) console.error('[paypal] subscription upsert failed', error.message);
}
