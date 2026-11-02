/**
 * Stripe webhook handler CORE (Nov 1, 2026 — repair branch
 * `lizzie/zervia-repair-2026-11-01`, from main@40647a81).
 *
 * This is the REAL billing route logic — every event case from
 * app/api/stripe/webhook/route.ts — extracted from the Next.js adapter so
 * the actual-route regression tests execute THIS module with injected
 * fakes (signature verifier, event store, service-role admin, Stripe,
 * CJ). The thin adapter at app/api/stripe/webhook/route.ts only maps
 * DeliveryOutcome -> NextResponse and wires production dependencies.
 *
 * Event-case behavior is preserved from main@40647a81 (no scope
 * changes); the repairs are:
 *  1. Durable event lifecycle (register -> claim -> processing ->
 *     completed | failed) per lib/webhooks/durable-events.ts.
 *  2. Repaired runEffect: ambiguous external outcomes are never blindly
 *     re-executed; success-then-ledger-failure is not downgraded to
 *     retryable-failed; effect ownership is fenced by the lease token.
 *  3. Ledger writes via lib/billing/ledger.ts: failures THROW (never
 *     silent), inserts are idempotent on the business effect key
 *     (provider + environment + merchant scope + effect type + provider
 *     effect id), repeat payloads are consistency-checked.
 *
 * No Next.js imports here: this module is plain TypeScript and runs
 * under node --test unchanged.
 */

import {
  AmbiguousEffectError,
  LEASE_MS,
  WORKER_ID,
  classifyError,
  classifyExternalError,
  newLeaseToken,
  runEffect,
  type DeliveryOutcome,
  type EventStore,
} from './durable-events';
import {
  ledgerEffectKey,
  recordTransaction,
  type LedgerAdmin,
  type LedgerEffectType,
} from '../billing/ledger';

// --- Minimal structural shapes (the adapter maps real SDK objects in) ---

export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: unknown };
}

export interface SessionLike {
  id: string;
  mode?: string;
  subscription?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
}

export interface SubscriptionLike {
  id: string;
  customer?: string | { id: string } | null;
  status: string;
  current_period_end?: number;
  items?: { data: Array<{ current_period_end?: number }> };
  metadata?: Record<string, string> | null;
}

export interface InvoiceLike {
  id: string;
  amount_paid?: number | null;
  currency?: string | null;
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
}

export interface PaymentIntentLike {
  id: string;
  last_payment_error?: { message?: string } | null;
}

export interface IdentitySessionLike {
  id: string;
  metadata?: Record<string, string> | null;
}

export interface ConnectAccountLike {
  id: string;
  metadata?: Record<string, string> | null;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  charges_enabled?: boolean;
}

export interface TransferLike {
  id: string;
  metadata?: Record<string, string> | null;
}

export interface DisputeLike {
  id: string;
  payment_intent?: string | { id: string } | null;
  status: string;
  amount: number;
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

export interface CjAddress {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  province: string;
  zip: string;
  countryCode: string;
  phone: string;
}

export interface StripeWebhookDeps {
  /** Verify the Stripe signature; throw/return-400-style errors as
   *  Error('bad_signature' | 'missing_signature'). */
  verifySignature(rawBody: string, signature: string | null): Promise<StripeEventLike>;
  store: EventStore;
  /** Null when billing is not configured -> 503. */
  admin: DbAdmin | null;
  retrieveSubscription(id: string): Promise<SubscriptionLike>;
  cjConfigured(): boolean;
  cjCreateOrder(
    items: Array<{ vid: string; quantity: number }>,
    address: CjAddress,
    remark: string
  ): Promise<string | null>;
  nowMs(): number;
  testMode: boolean;
  boostDays: number;
  featuredWeekDays: number;
  spotlightDays: number;
}

type Meta = {
  zervia_user_id?: string;
  zervia_provider_id?: string;
  zervia_booking_id?: string;
  zervia_payout_id?: string;
  zervia_tier?: string;
  zervia_interval?: string;
  zervia_kind?: string;
  zervia_listing_id?: string;
};

function metaOf(obj: { metadata?: Record<string, string> | null }): Meta {
  return (obj.metadata ?? {}) as Meta;
}

function periodEndOf(sub: SubscriptionLike): string | null {
  const direct = sub.current_period_end;
  const item = sub.items?.data?.[0]?.current_period_end;
  const ts = typeof direct === 'number' ? direct : item;
  return typeof ts === 'number' ? new Date(ts * 1000).toISOString() : null;
}

function strId(v: string | { id: string } | null | undefined): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v.id === 'string') return v.id;
  return null;
}

/**
 * A failed primary billing write must THROW so the outer catch marks the
 * event failed and returns 500 (Stripe retries) or 200/manualReview.
 * supabase-js resolves (it does not throw) on DB errors, so every
 * primary write checks its `{ error }`.
 */
function throwIfDbError(error: DbError | null | undefined, context: string): void {
  if (error) {
    throw new Error(`[stripe/webhook] ${context} failed: ${error.message ?? 'unknown database error'}`);
  }
}

async function terminal<T>(chain: QueryBuilder): Promise<DbResult<T>> {
  return (await chain.then((v) => v)) as DbResult<T>;
}

export async function handleStripeWebhook(
  deps: StripeWebhookDeps,
  rawBody: string,
  signature: string | null
): Promise<DeliveryOutcome> {
  const admin = deps.admin;
  if (!admin) {
    return { http: 503, body: { error: 'billing_not_configured' } };
  }
  if (!signature) {
    return { http: 400, body: { error: 'missing_signature' } };
  }

  let event: StripeEventLike;
  try {
    event = await deps.verifySignature(rawBody, signature);
  } catch {
    return { http: 400, body: { error: 'bad_signature' } };
  }

  // Durable lifecycle: register the event, then process it under an
  // atomic lease claim. 200 is returned ONLY for completed, deduped,
  // deferred-to-live-lease, or manual-review outcomes — every other
  // failure is 500 so Stripe retries.
  const store = deps.store;
  const nowMs = deps.nowMs();

  let eventRow;
  try {
    eventRow = await store.register(event.id, event.type);
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
      stripe_payment_intent_id?: string | null;
      stripe_invoice_id?: string | null;
      stripe_checkout_session_id?: string | null;
      amount_cents: number;
      currency?: string;
      status: 'pending' | 'succeeded' | 'failed' | 'refunded';
      description?: string | null;
    }
  ) =>
    recordTransaction(admin as unknown as LedgerAdmin, {
      ...row,
      effect_key: ledgerEffectKey({
        provider: 'stripe',
        testMode: deps.testMode,
        merchantScope,
        effectType,
        providerEffectId,
      }),
      stripe_event_id: event.id,
      type: effectType,
    });

  try {
    switch (event.type as string) {
      case 'checkout.session.completed': {
        const session = event.data.object as SessionLike;
        const m = metaOf(session);

        // Escrow (held booking payment): record the hold. The PaymentIntent
        // is authorized with manual capture; funds are captured on release.
        if (m.zervia_kind === 'escrow' && m.zervia_booking_id) {
          const piId = strId(session.payment_intent);
          const bkRes = await admin
            .from('bookings')
            .select('id, customer_id, provider_id')
            .eq('id', m.zervia_booking_id)
            .maybeSingle();
          throwIfDbError(bkRes.error, `escrow booking lookup ${m.zervia_booking_id}`);
          const bk = bkRes.data as { id: string; customer_id: string; provider_id: string } | null;
          if (bk) {
            const escrowRes = await terminal(
              admin.from('escrow_payments').upsert(
                {
                  booking_id: m.zervia_booking_id,
                  customer_id: bk.customer_id,
                  provider_id: bk.provider_id,
                  stripe_payment_intent_id: piId,
                  stripe_checkout_session_id: session.id,
                  amount_cents: session.amount_total ?? 0,
                  currency: session.currency ?? 'cad',
                  status: 'held',
                },
                { onConflict: 'booking_id' }
              )
            );
            throwIfDbError(escrowRes.error, `escrow hold upsert for booking ${m.zervia_booking_id}`);
            await ledger('escrow', m.zervia_booking_id, piId ?? session.id, {
              user_id: bk.customer_id,
              provider_id: bk.provider_id,
              stripe_payment_intent_id: piId,
              stripe_checkout_session_id: session.id,
              amount_cents: session.amount_total ?? 0,
              currency: session.currency ?? 'cad',
              status: 'succeeded',
              description: deps.testMode
                ? 'Escrow hold — payment secured (TEST MODE)'
                : 'Escrow hold — payment secured',
            });
          }
          break;
        }

        if (!m.zervia_user_id || !m.zervia_provider_id) {
          // Digital product orders don't have a provider — handle them
          // separately before dropping the event.
          if (m.zervia_kind === 'digital_product_order' && m.zervia_user_id) {
            const productSlug = (m as Record<string, string | undefined>)['zervia_product_slug'];
            if (productSlug) {
              const piId = strId(session.payment_intent);
              // Idempotent: unique constraint on (user_id, product_slug).
              const entRes = await terminal(
                admin.from('digital_entitlements').upsert(
                  {
                    user_id: m.zervia_user_id,
                    product_slug: productSlug,
                    stripe_checkout_session_id: session.id,
                    stripe_payment_intent_id: piId,
                    amount_cents: session.amount_total ?? 0,
                    currency: session.currency ?? 'cad',
                  },
                  { onConflict: 'user_id,product_slug', ignoreDuplicates: true }
                )
              );
              throwIfDbError(entRes.error, `digital entitlement upsert for user ${m.zervia_user_id} (${productSlug})`);
              await ledger('product_order', m.zervia_user_id, piId ?? session.id, {
                user_id: m.zervia_user_id,
                stripe_payment_intent_id: piId,
                stripe_checkout_session_id: session.id,
                amount_cents: session.amount_total ?? 0,
                currency: session.currency ?? 'cad',
                status: 'succeeded',
                description: `Digital product: ${productSlug}`,
              });
            }
          }
          break;
        }

        if (m.zervia_kind === 'boost' && m.zervia_listing_id) {
          await activateListingBoost(admin, m.zervia_listing_id, deps.boostDays);
          await ledger('boost', m.zervia_provider_id, strId(session.payment_intent) ?? session.id, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id: strId(session.payment_intent),
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            status: 'succeeded',
            description: 'Featured boost (7 days)',
          });
          break;
        }

        if (m.zervia_kind === 'verification_badge') {
          await activateVerificationBadge(admin, m.zervia_provider_id);
          await ledger('verification_badge', m.zervia_provider_id, strId(session.payment_intent) ?? session.id, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id: strId(session.payment_intent),
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            status: 'succeeded',
            description: 'Verification badge (one-time)',
          });
          break;
        }

        if (m.zervia_kind === 'featured_week' && m.zervia_listing_id) {
          await activateFeaturedWeek(admin, m.zervia_listing_id, deps.featuredWeekDays);
          await ledger('featured_week', m.zervia_provider_id, strId(session.payment_intent) ?? session.id, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id: strId(session.payment_intent),
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            status: 'succeeded',
            description: 'Featured week (7 days, top placement)',
          });
          break;
        }

        if (m.zervia_kind === 'profile_spotlight') {
          await activateProfileSpotlight(admin, m.zervia_provider_id, deps.spotlightDays);
          await ledger('profile_spotlight', m.zervia_provider_id, strId(session.payment_intent) ?? session.id, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id: strId(session.payment_intent),
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            status: 'succeeded',
            description: 'Profile spotlight (7 days)',
          });
          break;
        }

        // Physical product order: mark paid, decrement stock, then fulfill
        // via CJ Dropshipping (or queue for manual handling when CJ keys
        // are missing).
        //
        // Idempotent across Stripe retries: the order row is moved out of
        // pending_payment FIRST, guarded by .eq('status',
        // 'pending_payment'), so exactly one attempt owns fulfillment. A
        // retry after a partial failure sees the new status and skips —
        // no double stock decrement, no duplicate ledger row (the ledger
        // insert is additionally idempotent on the business effect key).
        // fulfillment_queued is set pessimistically in the claiming
        // update so a crash before the CJ result is persisted still lands
        // in the manual queue.
        if (m.zervia_kind === 'product_order') {
          const orderId = (m as Record<string, string | undefined>)['zervia_order_id'];
          if (orderId) {
            const piId = strId(session.payment_intent);
            const ordRes = await admin
              .from('product_orders')
              .select(
                'id, product_id, provider_id, buyer_id, quantity, unit_price_cents, total_cents, currency, status, ship_name, ship_address, ship_city, ship_province, ship_postal, ship_country, ship_phone'
              )
              .eq('id', orderId)
              .maybeSingle();
            throwIfDbError(ordRes.error, `product order lookup ${orderId}`);
            const ord = ordRes.data as {
              id: string; product_id: string; provider_id: string; buyer_id: string;
              quantity: number; unit_price_cents: number; total_cents: number;
              currency: string; status: string;
              ship_name: string | null; ship_address: string | null; ship_city: string | null;
              ship_province: string | null; ship_postal: string | null;
              ship_country: string | null; ship_phone: string | null;
            } | null;
            if (ord && ord.status === 'pending_payment') {
              const prodRes = await admin
                .from('products')
                .select('cj_product_id, cj_variant_id, stock')
                .eq('id', ord.product_id)
                .maybeSingle();
              throwIfDbError(prodRes.error, `product lookup ${ord.product_id}`);
              const p = prodRes.data as {
                cj_product_id: string | null;
                cj_variant_id: string | null;
                stock: number;
              } | null;

              // Claim the fulfillment work: only the attempt that moves
              // the order out of pending_payment proceeds past here.
              const claimRes = await terminal<{ id: string }[]>(
                admin
                  .from('product_orders')
                  .update({
                    status: 'fulfilling',
                    stripe_payment_intent_id: piId,
                    fulfillment_queued: true,
                  })
                  .eq('id', ord.id)
                  .eq('status', 'pending_payment')
                  .select('id')
              );
              throwIfDbError(claimRes.error, `product order claim ${ord.id}`);
              const claimedOrders = claimRes.data;
              if (claimedOrders && claimedOrders.length > 0) {
                // Decrement stock when tracked.
                if (p && p.stock !== -1) {
                  const stockRes = await terminal(
                    admin
                      .from('products')
                      .update({ stock: Math.max(0, p.stock - ord.quantity) })
                      .eq('id', ord.product_id)
                  );
                  throwIfDbError(stockRes.error, `stock decrement for product ${ord.product_id}`);
                }

                // Fulfillment: CJ API when configured, else manual queue.
                // Repaired (Nov 1): the CJ call runs through the
                // webhook_effects outbox with the CURRENT lease token as
                // the effect owner (fencing) and the stable order remark
                // as the idempotency/correlation identity, persisted
                // BEFORE dispatch. A completed effect is never
                // re-executed (the recorded CJ order id is reused); an
                // ambiguous effect (started by a crashed attempt, outcome
                // unknown — e.g. timeout after dispatch) is NEVER blindly
                // retried; success-then-ledger-failure throws
                // EffectLedgerWriteError (non-retryable) instead of being
                // downgraded to retryable-failed.
                let cjOrderId: string | null = null;
                let queued = false;
                const effectKey = `cj_create_order:${event.id}:${ord.id}`;
                const remark = `Zervia product order ${ord.id} / ${event.id}`;
                try {
                  if (deps.cjConfigured() && p?.cj_variant_id) {
                    const cjVariantId = p.cj_variant_id;
                    const [first = '', ...rest] = (ord.ship_name ?? '').split(' ');
                    const outcome = await runEffect(
                      store,
                      event.id,
                      'cj_create_order',
                      effectKey,
                      async () => {
                        try {
                          return await deps.cjCreateOrder(
                            [{ vid: cjVariantId, quantity: ord.quantity }],
                            {
                              firstName: first,
                              lastName: rest.join(' '),
                              address: ord.ship_address ?? '',
                              city: ord.ship_city ?? '',
                              province: ord.ship_province ?? '',
                              zip: ord.ship_postal ?? '',
                              countryCode: (ord.ship_country ?? 'CA').slice(0, 2).toUpperCase(),
                              phone: ord.ship_phone ?? '',
                            },
                            remark
                          );
                        } catch (e) {
                          // Typed taxonomy: timeout/reset after dispatch
                          // is UNKNOWN — never blindly re-executed.
                          throw classifyExternalError(e);
                        }
                      },
                      {
                        external: true,
                        ownerToken: leaseToken,
                        idempotencyKey: remark,
                        correlationId: event.id,
                      }
                    );
                    cjOrderId = outcome.externalId;
                  }
                } catch (e) {
                  if (e instanceof AmbiguousEffectError) {
                    // Ambiguous external effect: the payment + order rows
                    // are persisted below, but the CJ outcome is unknown.
                    // Fail the event as non-retryable so it lands in the
                    // manual-review queue instead of being silently
                    // completed or blindly retried.
                    queued = true;
                    const fulfillRes = await terminal(
                      admin
                        .from('product_orders')
                        .update({
                          status: 'pending_fulfillment',
                          cj_order_id: null,
                          fulfillment_queued: true,
                        })
                        .eq('id', ord.id)
                    );
                    throwIfDbError(fulfillRes.error, `product order fulfillment update ${ord.id}`);
                    throw e;
                  }
                  throw e;
                }
                if (!cjOrderId) queued = true;

                const fulfillRes = await terminal(
                  admin
                    .from('product_orders')
                    .update({
                      status: cjOrderId ? 'fulfilling' : 'pending_fulfillment',
                      cj_order_id: cjOrderId,
                      fulfillment_queued: queued,
                    })
                    .eq('id', ord.id)
                );
                throwIfDbError(fulfillRes.error, `product order fulfillment update ${ord.id}`);

                await ledger('product_order', ord.provider_id, piId ?? session.id, {
                  user_id: ord.buyer_id,
                  provider_id: ord.provider_id,
                  stripe_payment_intent_id: piId,
                  stripe_checkout_session_id: session.id,
                  amount_cents: session.amount_total ?? ord.total_cents,
                  currency: session.currency ?? ord.currency?.toLowerCase() ?? 'cad',
                  status: 'succeeded',
                  description: `Product order ${ord.id} (qty ${ord.quantity})`,
                });
              }
            }
          }
          break;
        }

        // Subscription checkout: mirror the subscription locally.
        if (session.mode === 'subscription' && typeof session.subscription === 'string') {
          const sub = await deps.retrieveSubscription(session.subscription);
          const sm = metaOf(sub);
          const tier = sm.zervia_tier === 'business' ? 'business' : 'pro';
          const interval = sm.zervia_interval === 'year' ? 'year' : 'month';
          const subUpsertRes = await terminal(
            admin.from('subscriptions').upsert(
              {
                provider_id: m.zervia_provider_id,
                user_id: m.zervia_user_id,
                stripe_subscription_id: sub.id,
                stripe_customer_id: strId(sub.customer) ?? '',
                tier,
                billing_interval: interval,
                status: sub.status,
                current_period_end: periodEndOf(sub),
              },
              { onConflict: 'provider_id' }
            )
          );
          throwIfDbError(subUpsertRes.error, `subscription upsert ${sub.id}`);
          await ledger('subscription', m.zervia_provider_id, sub.id, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id: strId(session.payment_intent),
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            status: 'succeeded',
            description: `Zervia ${tier} (${interval})`,
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as InvoiceLike;
        const subRef = invoice.parent?.subscription_details?.subscription ?? null;
        const subId = typeof subRef === 'string' ? subRef : subRef?.id ?? null;
        if (!subId) break;
        const subSelRes = await admin
          .from('subscriptions')
          .select('provider_id, user_id')
          .eq('stripe_subscription_id', subId)
          .single();
        // PGRST116 = no row (subscription never mirrored): keep the
        // historical skip. Any other DB error propagates so Stripe retries.
        if (subSelRes.error && !subSelRes.data && (subSelRes.error as DbError).code !== 'PGRST116') {
          throwIfDbError(subSelRes.error, `subscription lookup ${subId}`);
        }
        const row = subSelRes.data as { provider_id: string; user_id: string } | null;
        if (!row) break;
        const renewRes = await terminal(
          admin
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('stripe_subscription_id', subId)
        );
        throwIfDbError(renewRes.error, `subscription renewal ${subId}`);
        await ledger('subscription', row.provider_id, invoice.id, {
          user_id: row.user_id,
          provider_id: row.provider_id,
          stripe_invoice_id: invoice.id,
          amount_cents: invoice.amount_paid ?? 0,
          currency: invoice.currency ?? 'cad',
          status: 'succeeded',
          description: 'Subscription renewal',
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as SubscriptionLike;
        const sm = metaOf(sub);
        const tier = sm.zervia_tier === 'business' ? 'business' : 'pro';
        const subUpdateRes = await terminal(
          admin
            .from('subscriptions')
            .update({
              tier,
              status: sub.status,
              current_period_end: periodEndOf(sub),
            })
            .eq('stripe_subscription_id', sub.id)
        );
        throwIfDbError(subUpdateRes.error, `subscription update ${sub.id}`);
        // The DB trigger mirrors the tier onto providers: only
        // active/trialing keep the paid tier. past_due and canceled
        // drop back to starter, per the approved plan.
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as SubscriptionLike;
        const cancelRes = await terminal(
          admin
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('stripe_subscription_id', sub.id)
        );
        throwIfDbError(cancelRes.error, `subscription cancel ${sub.id}`);
        break;
      }

      /**
       * Stripe Identity document verification. The session's
       * `zervia_user_id` metadata is the durable user link (set at
       * session creation in lib/verification.ts). Writes go through the
       * service-role client — app users never write these columns.
       *
       * NOTE: the identity_status / identity_session_id columns arrive
       * with migration 0031_identity_verification.sql. Until it is
       * applied the update fails — the error is caught and logged so a
       * not-yet-migrated deploy never 500s on a valid Stripe event.
       * (Kept from main@40647a81; unchanged by this repair.)
       */
      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input': {
        const session = event.data.object as IdentitySessionLike;
        const userId = session.metadata?.zervia_user_id;
        const status = event.type === 'identity.verification_session.verified' ? 'verified' : 'failed';
        if (userId) {
          try {
            const idRes = await terminal(
              admin
                .from('profiles')
                .update({ identity_status: status, identity_session_id: session.id })
                .eq('id', userId)
            );
            if (idRes.error) {
              // eslint-disable-next-line no-console
              console.error(
                '[stripe/webhook] identity status write failed — apply migration 0031 if the column is missing',
                idRes.error.message
              );
            }
          } catch {
            // eslint-disable-next-line no-console
            console.error('[stripe/webhook] identity status write threw');
          }
          // Community → Verified upgrade via Stripe Identity: a
          // verified session flips the user's provider tier too
          // (best-effort; provider_tier is migration 0052).
          if (status === 'verified') {
            try {
              await terminal(
                admin
                  .from('providers')
                  .update({ provider_tier: 'verified' })
                  .eq('user_id', userId)
              );
            } catch {
              // eslint-disable-next-line no-console
              console.error('[stripe/webhook] tier upgrade write threw');
            }
          }
        }
        break;
      }

      /**
       * Stripe Connect Express account updates. Syncs the provider's
       * onboarding status so the payouts dashboard knows when the
       * provider can receive money.
       */
      case 'account.updated': {
        const account = event.data.object as ConnectAccountLike;
        const providerId = account.metadata?.zervia_provider_id;
        if (providerId) {
          const onboardingComplete =
            (account.details_submitted ?? false) &&
            (account.payouts_enabled ?? false);
          const acctRes = await terminal(
            admin
              .from('providers')
              .update({
                stripe_connect_onboarding_complete: onboardingComplete,
                stripe_connect_charges_enabled: account.charges_enabled ?? false,
                stripe_connect_payouts_enabled: account.payouts_enabled ?? false,
                stripe_connect_onboarded_at: onboardingComplete
                  ? new Date(nowMs).toISOString()
                  : null,
              })
              .eq('id', providerId)
          );
          throwIfDbError(acctRes.error, `connect account sync for provider ${providerId}`);
        }
        break;
      }

      /**
       * Stripe Connect transfer failures. A transfer can fail async —
       * e.g. the recipient's bank rejects it hours after creation. Mark
       * the payout row failed with Stripe's reason so an admin can retry
       * it from the payouts view.
       */
      case 'transfer.failed':
      case 'transfer.reversed': {
        const transfer = event.data.object as TransferLike;
        const payoutId = transfer.metadata?.zervia_payout_id;
        if (payoutId) {
          const reason =
            event.type === 'transfer.reversed'
              ? 'Transfer reversed by Stripe'
              : 'Transfer failed at the destination bank';
          const payoutRes = await terminal(
            admin
              .from('payouts')
              .update({ status: 'failed', failure_reason: reason.slice(0, 500) })
              .eq('id', payoutId)
              .eq('status', 'paid')
          );
          throwIfDbError(payoutRes.error, `payout failure mark ${payoutId}`);
        }
        break;
      }

      /**
       * Own-product payment failure: a failed PaymentIntent for a
       * subscription/boost/digital/product charge marks the matching
       * transaction failed so the admin revenue view never shows it as
       * pending forever. (Kept from main@40647a81.)
       */
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as PaymentIntentLike;
        const txFailRes = await terminal(
          admin
            .from('transactions')
            .update({ status: 'failed' })
            .eq('stripe_payment_intent_id', pi.id)
            .eq('status', 'pending')
        );
        throwIfDbError(txFailRes.error, `payment-failed mark for intent ${pi.id}`);
        break;
      }

      /**
       * Own-product disputes: log at error level with the dispute +
       * payment intent ids; disputes on Zervia's own charges are
       * answered in the Stripe Dashboard, where the evidence portal
       * lives. (Kept from main@40647a81; log-only by design.)
       */
      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        const dispute = event.data.object as DisputeLike;
        // eslint-disable-next-line no-console
        console.error(
          '[stripe/webhook]',
          event.type,
          'dispute',
          dispute.id,
          'payment_intent',
          strId(dispute.payment_intent) ?? '',
          'status',
          dispute.status,
          'amount',
          dispute.amount
        );
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // FAILURE PATH (repaired Nov 1): the event was claimed and marked
    // processing under our lease. Mark it failed (compare-and-set on the
    // lease token) with retry scheduling. Retryable failures return 500
    // so Stripe redelivers; the next delivery re-claims after the
    // backoff and reprocesses idempotently (guarded transitions +
    // idempotent ledger). Non-retryable failures (ambiguous external
    // effects, ledger write after external success, ledger conflicts)
    // return 200 with manualReview — they stay failed for human
    // reconciliation in the durable manual-review queue and are never
    // auto-redriven or silently completed.
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

async function activateListingBoost(admin: DbAdmin, listingId: string, boostDays: number) {
  // Two-tier launch: Community providers are never Featured-eligible.
  // Checkout blocks the purchase; this is defence in depth for a
  // session created before the guard (or via another client).
  {
    const lrowRes = await admin
      .from('listings')
      .select('provider_id')
      .eq('id', listingId)
      .maybeSingle();
    const lrow = lrowRes.data as { provider_id?: string } | null;
    if (lrow?.provider_id) {
      const prowRes = await admin
        .from('providers')
        .select('provider_tier')
        .eq('id', lrow.provider_id)
        .maybeSingle();
      const prow = prowRes.data as { provider_tier?: string | null } | null;
      if (prow?.provider_tier === 'community') {
        return;
      }
    }
  }
  const until = new Date(Date.now() + boostDays * 24 * 60 * 60 * 1000).toISOString();
  const res = await terminal(
    admin
      .from('listings')
      .update({ is_featured: true, featured_until: until, featured_priority: 1 })
      .eq('id', listingId)
  );
  throwIfDbError(res.error, `boost activation for listing ${listingId}`);
}

async function activateFeaturedWeek(admin: DbAdmin, listingId: string, featuredWeekDays: number) {
  {
    const lrowRes = await admin
      .from('listings')
      .select('provider_id')
      .eq('id', listingId)
      .maybeSingle();
    const lrow = lrowRes.data as { provider_id?: string } | null;
    if (lrow?.provider_id) {
      const prowRes = await admin
        .from('providers')
        .select('provider_tier')
        .eq('id', lrow.provider_id)
        .maybeSingle();
      const prow = prowRes.data as { provider_tier?: string | null } | null;
      if (prow?.provider_tier === 'community') {
        return;
      }
    }
  }
  const until = new Date(Date.now() + featuredWeekDays * 24 * 60 * 60 * 1000).toISOString();
  const res = await terminal(
    admin
      .from('listings')
      .update({ is_featured: true, featured_until: until, featured_priority: 2 })
      .eq('id', listingId)
  );
  throwIfDbError(res.error, `featured-week activation for listing ${listingId}`);
}

async function activateVerificationBadge(admin: DbAdmin, providerId: string) {
  const res = await terminal(
    admin
      .from('providers')
      .update({ verification_badge: true })
      .eq('id', providerId)
  );
  throwIfDbError(res.error, `verification-badge activation for provider ${providerId}`);
}

async function activateProfileSpotlight(admin: DbAdmin, providerId: string, spotlightDays: number) {
  const until = new Date(Date.now() + spotlightDays * 24 * 60 * 60 * 1000).toISOString();
  const res = await terminal(
    admin
      .from('providers')
      .update({ spotlight_until: until })
      .eq('id', providerId)
  );
  throwIfDbError(res.error, `profile-spotlight activation for provider ${providerId}`);
}
