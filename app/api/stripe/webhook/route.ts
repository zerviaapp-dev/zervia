import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeTestMode } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { BOOST_DAYS, FEATURED_WEEK_DAYS, SPOTLIGHT_DAYS } from '@/lib/pricing';
import {
  handleStripeWebhook,
  type DbAdmin,
  type StripeEventLike,
  type SubscriptionLike,
} from '@/lib/webhooks/stripe-handler';
import { SupabaseEventStore } from '@/lib/webhooks/supabase-event-store';
import { createCjOrder, isCjConfigured } from '@/lib/cj-dropshipping';

export const runtime = 'nodejs';

/**
 * Stripe webhook — thin Next.js adapter (Nov 1, 2026 repair branch
 * `lizzie/zervia-repair-2026-11-01`, from main@40647a81).
 *
 * ALL billing logic lives in lib/webhooks/stripe-handler.ts
 * (handleStripeWebhook), which the actual-route regression tests execute
 * directly with injected fakes. This adapter only:
 *  1. wires production dependencies (Stripe SDK, service-role Supabase
 *     client, CJ dropshipping, pricing constants),
 *  2. maps DeliveryOutcome -> NextResponse.
 *
 * Money-safety rules (non-negotiable, carried from main):
 *  1. The event signature is ALWAYS verified with STRIPE_WEBHOOK_SECRET.
 *     An unverified request can never write a money row.
 *  2. Every event is registered in `webhook_events` and processed under
 *     an atomic lease claim: received -> claimed -> processing ->
 *     completed | failed. `completed` is terminal — replays are
 *     acknowledged but not reprocessed.
 *  3. Ambiguous external effects (e.g. CJ timeout after dispatch) are
 *     NEVER blindly re-executed — they fail non-retryable into the
 *     durable manual-review queue (200 manualReview).
 *  4. Ledger writes are loud and idempotent on the business effect key
 *     (provider + environment + merchant scope + effect type + provider
 *     effect id); failures THROW, never console.error-and-continue.
 *  5. Amounts come from Stripe's objects, never from our own math.
 *
 * Migration note: `webhook_events`/`webhook_effects` +
 * `transactions.effect_key` ship UNAPPLIED in
 * supabase/migrations/20261101000000_webhook_events.sql (separate
 * review; no production migration authorized).
 */

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  const outcome = await handleStripeWebhook(
    {
      verifySignature: async (body: string, sig: string | null) => {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!sig || !webhookSecret) {
          // Missing secret/signature surfaces as a 400, never a write.
          throw new Error(!sig ? 'missing_signature' : 'bad_signature');
        }
        return getStripe().webhooks.constructEvent(
          body,
          sig,
          webhookSecret
        ) as unknown as StripeEventLike;
      },
      store: new SupabaseEventStore(
        createAdminClient() as unknown as ConstructorParameters<typeof SupabaseEventStore>[0]
      ),
      admin: createAdminClient() as unknown as DbAdmin,
      retrieveSubscription: async (id: string) =>
        (await getStripe().subscriptions.retrieve(id)) as unknown as SubscriptionLike,
      cjConfigured: () => isCjConfigured(),
      cjCreateOrder: (items, address, remark) => createCjOrder(items, address, remark),
      nowMs: () => Date.now(),
      testMode: isStripeTestMode(),
      boostDays: BOOST_DAYS,
      featuredWeekDays: FEATURED_WEEK_DAYS,
      spotlightDays: SPOTLIGHT_DAYS,
    },
    rawBody,
    signature
  );

  return NextResponse.json(outcome.body, { status: outcome.http });
}
