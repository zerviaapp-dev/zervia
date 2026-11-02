import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPayPalConfigured, paypalMode, verifyPayPalWebhook } from '@/lib/paypal';
import {
  handlePayPalWebhook,
  type DbAdmin,
  type PayPalEventLike,
  type PayPalHeaders,
} from '@/lib/webhooks/paypal-handler';
import { SupabaseEventStore } from '@/lib/webhooks/supabase-event-store';

export const runtime = 'nodejs';

/**
 * PayPal webhook — thin Next.js adapter (Nov 1, 2026 repair branch
 * `lizzie/zervia-repair-2026-11-01`).
 *
 * ALL billing logic lives in lib/webhooks/paypal-handler.ts
 * (handlePayPalWebhook), which the actual-route regression tests execute
 * directly with injected fakes. This adapter only:
 *  1. wires production dependencies (PayPal signature verification,
 *     service-role Supabase client),
 *  2. maps DeliveryOutcome -> NextResponse.
 *
 * Money-safety rules (non-negotiable, same durable pattern as the
 * Stripe webhook):
 *  1. The event signature is ALWAYS verified with PayPal's
 *     verify-webhook-signature API (needs PAYPAL_WEBHOOK_ID), BEFORE any
 *     write. An unverified request can never write a money row.
 *  2. Every event is registered in `webhook_events` and processed under
 *     an atomic lease claim: received -> claimed -> processing ->
 *     completed | failed. `completed` is terminal — replays are
 *     acknowledged but not reprocessed.
 *  3. Ledger writes are loud and idempotent on the business effect key
 *     (provider + environment + merchant scope + effect type + provider
 *     effect id); failures THROW, never console.error-and-continue.
 *  4. Handler failures NEVER return a silent success 200: retryable
 *     failures return 500 (PayPal redelivers); non-retryable failures
 *     (e.g. inconsistent duplicate payloads) return 200/manualReview
 *     for human reconciliation.
 *  5. Amounts come from PayPal's objects, never from our own math.
 *
 * Migration note: `webhook_events`/`webhook_effects` +
 * `transactions.effect_key` ship UNAPPLIED in
 * supabase/migrations/20261101000000_webhook_events.sql (separate
 * review; no production migration authorized).
 *
 * Handled events:
 * - PAYMENT.CAPTURE.COMPLETED: safety net for one-time purchases in
 *   case the return-URL capture was missed (e.g. buyer closed the
 *   tab). Records the capture; does NOT activate the purchase (the
 *   return-URL capture route is the primary fulfiller — verify before
 *   fulfilling).
 * - BILLING.SUBSCRIPTION.ACTIVATED: mirrors the membership locally.
 * - BILLING.SUBSCRIPTION.CANCELLED / .SUSPENDED / PAYMENT.FAILED:
 *   updates the local subscription status.
 */

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headers: PayPalHeaders = {
    'paypal-auth-algo': req.headers.get('paypal-auth-algo'),
    'paypal-cert-url': req.headers.get('paypal-cert-url'),
    'paypal-transmission-id': req.headers.get('paypal-transmission-id'),
    'paypal-transmission-sig': req.headers.get('paypal-transmission-sig'),
    'paypal-transmission-time': req.headers.get('paypal-transmission-time'),
  };

  const outcome = await handlePayPalWebhook(
    {
      verifySignature: async (body: string, hdrs: PayPalHeaders) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          // Unparseable body can never be a verified PayPal event.
          throw new Error('bad_signature');
        }
        const verified = await verifyPayPalWebhook(hdrs, parsed);
        if (!verified || !isPayPalConfigured()) {
          throw new Error('bad_signature');
        }
        const evt = parsed as { id?: unknown; event_type?: unknown };
        if (typeof evt.id !== 'string' || typeof evt.event_type !== 'string') {
          throw new Error('bad_signature');
        }
        return parsed as PayPalEventLike;
      },
      store: new SupabaseEventStore(
        createAdminClient() as unknown as ConstructorParameters<typeof SupabaseEventStore>[0]
      ),
      admin: createAdminClient() as unknown as DbAdmin,
      nowMs: () => Date.now(),
      testMode: paypalMode() !== 'live',
    },
    rawBody,
    headers
  );

  return NextResponse.json(outcome.body, { status: outcome.http });
}
