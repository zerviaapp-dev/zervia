/**
 * PayPal webhook handler CORE (Nov 1, 2026 — repair branch
 * `lizzie/zervia-repair-2026-11-01`).
 *
 * This is the REAL PayPal billing route logic — every event case from
 * app/api/paypal/webhook/route.ts — extracted from the Next.js adapter so
 * the actual-route regression tests execute THIS module with injected
 * fakes (signature verifier, event store, service-role admin). The thin
 * adapter at app/api/paypal/webhook/route.ts only maps DeliveryOutcome ->
 * NextResponse and wires production dependencies.
 *
 * The old route (pre-repair) had no status machine, no lease, no retry,
 * and no manual-review queue: handler failures were console.error'd and
 * the route still returned 200 {received:true}, silently swallowing
 * failed money events. This module applies the SAME durable pattern as
 * lib/webhooks/stripe-handler.ts (commit 3b2e82bccf):
 *  1. PayPal signature verification happens FIRST — an unverified
 *     request can never write a money row (and registers nothing).
 *  2. Durable event lifecycle: register -> claim -> processing ->
 *     completed | failed (atomic lease claim, terminal dedupe).
 *  3. Ledger writes via lib/billing/ledger.ts: failures THROW (never
 *     silent), inserts are idempotent on the business effect key
 *     (provider=paypal + environment + merchant scope + effect type +
 *     provider effect id), repeat payloads are consistency-checked.
 *  4. Failures return 500 (retryable, so PayPal redelivers) or
 *     200/manualReview (non-retryable, human reconciliation) — never a
 *     silent success 200.
 *
 * Event-case behavior is preserved from the old route (no scope
 * changes): the PAYMENT.CAPTURE.COMPLETED case stays a safety net that
 * records the capture but does NOT activate the purchase (the
 * return-URL capture route is the primary fulfiller); subscription
 * events mirror the local subscription row.
 *
 * No Next.js imports here: this module is plain TypeScript and runs
 * under node --test unchanged.
 */

import {
  LEASE_MS,
  WORKER_ID,
  classifyError,
  newLeaseToken,
  type DeliveryOutcome,
  type EventStore,
} from './durable-events';
import {
  ledgerEffectKey,
  recordTransaction,
  type LedgerAdmin,
  type LedgerEffectType,
} from '../billing/ledger';

// --- Minimal structural shapes (the adapter maps real PayPal objects in) ---

export interface PayPalEventLike {
  id: string;
  event_type: string;
  resource?: Record<string, unknown>;
}

export interface PayPalHeaders {
  /** String map of the PayPal transmission headers. The index signature
   *  keeps this assignable to lib/paypal.ts's
   *  `Record<string, string | null>` parameter. */
  [key: string]: string | null;
  'paypal-auth-algo': string | null;
  'paypal-cert-url': string | null;
  'paypal-transmission-id': string | null;
  'paypal-transmission-sig': string | null;
  'paypal-transmission-time': string | null;
}

export interface DbError {
  message: string;
  code?: string;
}
export interface DbResult<T = unknown> {
  data: T;
  error: DbError | null;
}
export interface QueryBuilder {
  eq(col: string, val: unknown): QueryBuilder;
  select(cols?: string): QueryBuilder;
  maybeSingle(): Promise<DbResult<unknown>>;
  single(): Promise<DbResult<unknown>>;
  then(
    onFulfilled: (v: DbResult<unknown>) => unknown,
    onRejected?: (e: unknown) => unknown
  ): Promise<unknown>;
}
export interface DbAdmin {
  from(table: string): {
    select(cols: string): QueryBuilder;
    insert(row: Record<string, unknown>): QueryBuilder;
    update(row: Record<string, unknown>): QueryBuilder;
    upsert(row: Record<string, unknown>, opts?: Record<string, unknown>): QueryBuilder;
  };
}

export interface PayPalWebhookDeps {
  /** Verify the PayPal webhook signature; throw/return-400-style errors
   *  as Error('bad_signature' | 'missing_signature'). */
  verifySignature(rawBody: string, headers: PayPalHeaders): Promise<PayPalEventLike>;
  store: EventStore;
  /** Null when PayPal is not configured -> 503. */
  admin: DbAdmin | null;
  nowMs(): number;
  /** true in sandbox, false in live. */
  testMode: boolean;
}

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
 * A failed primary billing write must THROW so the outer catch marks the
 * event failed and returns 500 (PayPal retries) or 200/manualReview.
 * supabase-js resolves (it does not throw) on DB errors, so every
 * primary write checks its `{ error }`.
 */
function throwIfDbError(error: DbError | null | undefined, context: string): void {
  if (error) {
    throw new Error(`[paypal/webhook] ${context} failed: ${error.message ?? 'unknown database error'}`);
  }
}

async function terminal<T>(chain: QueryBuilder): Promise<DbResult<T>> {
  return (await chain.then((v) => v)) as DbResult<T>;
}

export async function handlePayPalWebhook(
  deps: PayPalWebhookDeps,
  rawBody: string,
  headers: PayPalHeaders
): Promise<DeliveryOutcome> {
  const admin = deps.admin;
  if (!admin) {
    return { http: 503, body: { error: 'billing_not_configured' } };
  }
  if (!headers['paypal-transmission-sig']) {
    return { http: 400, body: { error: 'missing_signature' } };
  }

  // VERIFY FIRST: the signature is checked before ANY write — even
  // before the event is registered. An unverified request can never
  // write a money row.
  let event: PayPalEventLike;
  try {
    event = await deps.verifySignature(rawBody, headers);
  } catch {
    return { http: 400, body: { error: 'bad_signature' } };
  }

  // Durable lifecycle: register the event, then process it under an
  // atomic lease claim. 200 is returned ONLY for completed, deduped,
  // deferred-to-live-lease, or manual-review outcomes — every other
  // failure is 500 so PayPal retries.
  const store = deps.store;
  const nowMs = deps.nowMs();

  let eventRow;
  try {
    eventRow = await store.register(event.id, event.event_type);
  } catch (regErr) {
    return { http: 500, body: { error: 'event_register_failed' } };
  }
  if (eventRow.state === 'completed') {
    // Terminal dedupe: this exact event already completed. Acknowledge
    // without reprocessing — never re-run fulfillment.
    return { http: 200, body: { received: true, deduped: true } };
  }

  const leaseToken = newLeaseToken();
  let claim;
  try {
    claim = await store.claim(event.id, leaseToken, LEASE_MS, WORKER_ID, nowMs);
  } catch {
    // DB outage on claim: the event is NOT completed — never 200.
    return { http: 500, body: { error: 'event_claim_failed' } };
  }
  if (!claim.claimed) {
    if (claim.prevState === 'completed') {
      return { http: 200, body: { received: true, deduped: true } };
    }
    // Another worker holds a live lease, or the event is failed with a
    // backoff / non-retryable. Defer: the lease-holder will complete it,
    // or the lease will expire and a later delivery redrives it.
    return { http: 200, body: { received: true, deferred: true } };
  }
  const began = await store.beginProcessing(event.id, leaseToken);
  if (!began) {
    return { http: 500, body: { error: 'begin_processing_failed' } };
  }

  /** Loud, duplicate-safe ledger write. */
  const ledger = (
    effectType: LedgerEffectType,
    merchantScope: string,
    providerEffectId: string,
    row: {
      user_id: string;
      provider_id?: string | null;
      amount_cents: number;
      currency?: string;
      status: 'pending' | 'succeeded' | 'failed' | 'refunded';
      description?: string | null;
    }
  ) =>
    recordTransaction(admin as unknown as LedgerAdmin, {
      ...row,
      effect_key: ledgerEffectKey({
        provider: 'paypal',
        testMode: deps.testMode,
        merchantScope,
        effectType,
        providerEffectId,
      }),
      stripe_event_id: event.id,
      type: effectType,
    });

  try {
    switch (event.event_type as string) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Safety net only: the return-URL capture route is the primary
        // fulfiller. We record the capture as a transaction if we have
        // not already fulfilled this order (dedupe via paypal_orders).
        // NOTE: this deliberately does NOT activate the purchase — the
        // description says to verify before fulfilling.
        const resource = event.resource ?? {};
        const orderId =
          (resource as { supplementary_data?: { related_ids?: { order_id?: string } } })
            .supplementary_data?.related_ids?.order_id ??
          (typeof resource.id === 'string' ? resource.id : null);
        if (!orderId) break;
        const knownRes = await admin
          .from('paypal_orders')
          .select('paypal_order_id')
          .eq('paypal_order_id', orderId)
          .maybeSingle();
        throwIfDbError(knownRes.error, `paypal order lookup ${orderId}`);
        if (knownRes.data) break; // already handled by the capture route
        const custom = parseCustomId((resource as { custom_id?: unknown }).custom_id);
        if (!custom.user_id || !custom.provider_id) break;
        const amount = resource.amount as { currency_code?: string; value?: string } | undefined;
        const parsed = parseFloat(amount?.value ?? '0');
        const cents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
        const captureId = typeof resource.id === 'string' ? resource.id : null;
        const poRes = await terminal(
          admin.from('paypal_orders').insert({
            paypal_order_id: orderId,
            kind: 'webhook_capture',
            provider_id: custom.provider_id,
          })
        );
        throwIfDbError(poRes.error, `paypal order insert ${orderId}`);
        await ledger('boost', custom.provider_id, captureId ?? orderId, {
          user_id: custom.user_id,
          provider_id: custom.provider_id,
          amount_cents: cents,
          currency: (amount?.currency_code ?? 'CAD').toLowerCase(),
          status: 'succeeded',
          description: `PayPal capture (webhook safety net — verify before fulfilling) — order ${orderId}`,
        });
        break;
      }

      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const resource = event.resource ?? {};
        const custom = parseCustomId((resource as { custom_id?: unknown }).custom_id);
        if (!custom.user_id || !custom.provider_id) break;
        const tier = custom.tier === 'business' ? 'business' : 'pro';
        const interval = custom.interval === 'year' ? 'year' : 'month';
        const subId = typeof resource.id === 'string' ? resource.id : '';
        const nextBilling =
          typeof (resource as { billing_info?: { next_billing_time?: string } }).billing_info
            ?.next_billing_time === 'string'
            ? ((resource as { billing_info?: { next_billing_time?: string } }).billing_info!
                .next_billing_time as string)
            : null;
        const subRes = await terminal(
          admin.from('subscriptions').upsert(
            {
              provider_id: custom.provider_id,
              user_id: custom.user_id,
              stripe_subscription_id: `paypal:${subId}`,
              stripe_customer_id: `paypal:${custom.user_id}`,
              tier,
              billing_interval: interval,
              status: 'active',
              current_period_end: nextBilling,
            },
            { onConflict: 'provider_id' }
          )
        );
        throwIfDbError(subRes.error, `paypal subscription upsert ${subId}`);
        await ledger('subscription', custom.provider_id, subId, {
          user_id: custom.user_id,
          provider_id: custom.provider_id,
          amount_cents: 0,
          currency: 'cad',
          status: 'succeeded',
          description: `Zervia ${tier} (${interval}) — PayPal subscription ${subId} activated`,
        });
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const resource = event.resource ?? {};
        const subId = typeof resource.id === 'string' ? resource.id : '';
        if (!subId) break;
        const status =
          event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED'
            ? 'canceled'
            : event.event_type === 'BILLING.SUBSCRIPTION.SUSPENDED'
              ? 'suspended'
              : 'past_due';
        const updRes = await terminal(
          admin
            .from('subscriptions')
            .update({ status })
            .eq('stripe_subscription_id', `paypal:${subId}`)
        );
        throwIfDbError(updRes.error, `paypal subscription status update ${subId}`);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // FAILURE PATH (same as the Stripe handler): the event was claimed
    // and marked processing under our lease. Mark it failed
    // (compare-and-set on the lease token) with retry scheduling.
    // Retryable failures return 500 so PayPal redelivers; the next
    // delivery re-claims after the backoff and reprocesses idempotently
    // (guarded transitions + idempotent ledger). Non-retryable failures
    // (ledger conflicts, etc.) return 200 with manualReview — they stay
    // failed for human reconciliation in the durable manual-review queue
    // and are never auto-redriven or silently completed.
    const retryable = classifyError(err);
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      await store.fail(event.id, leaseToken, retryable, errMsg, deps.nowMs());
    } catch {
      // The fail transition itself failed (DB outage): the event stays
      // processing until the lease expires, then a redrive picks it up.
    }
    if (!retryable) {
      return { http: 200, body: { received: true, manualReview: true } };
    }
    return { http: 500, body: { error: 'event_processing_failed', event_id: event.id } };
  }

  // SUCCESS PATH: complete the event — compare-and-set on the lease
  // token. If this returns false our lease was superseded (a redrive
  // worker took over): NEVER report success for a superseded lease.
  let completedOk = false;
  try {
    completedOk = await store.complete(event.id, leaseToken);
  } catch {
    // complete transition failed (DB outage): the event stays
    // processing until lease expiry; a redrive will finish it.
  }
  if (!completedOk) {
    return { http: 500, body: { error: 'lease_lost' } };
  }

  return { http: 200, body: { received: true } };
}
