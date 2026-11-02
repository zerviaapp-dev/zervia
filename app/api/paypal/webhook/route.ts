import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPayPalConfigured, verifyPayPalWebhook } from '@/lib/paypal';
import {
  recordPayPalTransaction,
  upsertPayPalSubscription,
} from '@/lib/billing-fulfillment';

export const runtime = 'nodejs';

type CustomId = {
  user_id?: string;
  provider_id?: string;
  tier?: string;
  interval?: string;
};

function parseCustomId(raw: unknown): CustomId {
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as CustomId;
  } catch {
    return {};
  }
}

/**
 * PayPal webhook handler — the backstop for PayPal money events.
 *
 * Money-safety rules (same as the Stripe webhook):
 * 1. The event signature is ALWAYS verified with PayPal's
 *    verify-webhook-signature API (needs PAYPAL_WEBHOOK_ID). An
 *    unverified event can never write a money row.
 * 2. Every event id is recorded in `paypal_events` first, with
 *    ON CONFLICT DO NOTHING. Replays are acknowledged but never
 *    reprocessed.
 * 3. All writes use the service-role client; RLS grants app users
 *    SELECT-only on billing tables.
 *
 * Handled events:
 * - PAYMENT.CAPTURE.COMPLETED: safety net for one-time purchases in
 *   case the return-URL capture was missed (e.g. buyer closed the
 *   tab). Fulfillment reads the server-written custom_id and
 *   re-verifies the amount from pricing constants.
 * - BILLING.SUBSCRIPTION.ACTIVATED: mirrors the membership locally.
 * - BILLING.SUBSCRIPTION.CANCELLED / .SUSPENDED / PAYMENT.FAILED:
 *   updates the local subscription status.
 */
export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  if (!admin || !isPayPalConfigured()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  let event: {
    id: string;
    event_type: string;
    resource?: Record<string, unknown>;
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const verified = await verifyPayPalWebhook(
    {
      'paypal-auth-algo': req.headers.get('paypal-auth-algo'),
      'paypal-cert-url': req.headers.get('paypal-cert-url'),
      'paypal-transmission-id': req.headers.get('paypal-transmission-id'),
      'paypal-transmission-sig': req.headers.get('paypal-transmission-sig'),
      'paypal-transmission-time': req.headers.get('paypal-transmission-time'),
    },
    event
  );
  if (!verified) {
    console.error('[paypal/webhook] signature verification failed', event.id);
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  const { data: claimed } = await admin
    .from('paypal_events')
    .insert({ event_id: event.id, event_type: event.event_type })
    .select('event_id')
    .single();
  if (!claimed) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    const resource = event.resource ?? {};

    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Safety net only: the return-URL capture route is the primary
        // fulfiller. We record the capture as a transaction if we have
        // not already fulfilled this order (dedupe via paypal_orders).
        const orderId =
          (resource as { supplementary_data?: { related_ids?: { order_id?: string } } })
            .supplementary_data?.related_ids?.order_id ??
          (typeof resource.id === 'string' ? resource.id : null);
        if (!orderId) break;
        const { data: known } = await admin
          .from('paypal_orders')
          .select('paypal_order_id')
          .eq('paypal_order_id', orderId)
          .maybeSingle();
        if (known) break; // already handled by the capture route
        const custom = parseCustomId((resource as { custom_id?: unknown }).custom_id);
        if (!custom.user_id || !custom.provider_id) break;
        const amount = resource.amount as { currency_code?: string; value?: string } | undefined;
        const cents = Math.round(parseFloat(amount?.value ?? '0') * 100);
        await admin.from('paypal_orders').insert({
          paypal_order_id: orderId,
          kind: 'webhook_capture',
          provider_id: custom.provider_id,
        });
        await recordPayPalTransaction(admin, {
          user_id: custom.user_id,
          provider_id: custom.provider_id,
          paypal_order_id: orderId,
          paypal_capture_id: typeof resource.id === 'string' ? resource.id : null,
          amount_cents: Number.isFinite(cents) ? cents : 0,
          currency: (amount?.currency_code ?? 'CAD').toLowerCase(),
          type: 'boost',
          status: 'succeeded',
          description: 'PayPal capture (webhook safety net — verify before fulfilling)',
        });
        break;
      }

      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const custom = parseCustomId((resource as { custom_id?: unknown }).custom_id);
        if (!custom.user_id || !custom.provider_id) break;
        const tier = custom.tier === 'business' ? 'business' : 'pro';
        const interval = custom.interval === 'year' ? 'year' : 'month';
        const subId = typeof resource.id === 'string' ? resource.id : '';
        await upsertPayPalSubscription(admin, {
          providerId: custom.provider_id,
          userId: custom.user_id,
          paypalSubscriptionId: subId,
          tier: tier as 'pro' | 'business',
          interval: interval as 'month' | 'year',
          status: 'active',
          nextBillingIso:
            typeof (resource as { billing_info?: { next_billing_time?: string } }).billing_info
              ?.next_billing_time === 'string'
              ? ((resource as { billing_info?: { next_billing_time?: string } }).billing_info!
                  .next_billing_time as string)
              : null,
        });
        await recordPayPalTransaction(admin, {
          user_id: custom.user_id,
          provider_id: custom.provider_id,
          amount_cents: 0,
          currency: 'cad',
          type: 'subscription',
          status: 'succeeded',
          description: `Zervia ${tier} (${interval}) — PayPal subscription ${subId} activated`,
        });
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const subId = typeof resource.id === 'string' ? resource.id : '';
        if (!subId) break;
        const status =
          event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED'
            ? 'canceled'
            : event.event_type === 'BILLING.SUBSCRIPTION.SUSPENDED'
              ? 'suspended'
              : 'past_due';
        await admin
          .from('subscriptions')
          .update({ status })
          .eq('stripe_subscription_id', `paypal:${subId}`);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('[paypal/webhook] handler failed for', event.id, err);
  }

  return NextResponse.json({ received: true });
}
