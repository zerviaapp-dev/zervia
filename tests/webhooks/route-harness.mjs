/**
 * Harness for the ACTUAL-route regression tests.
 *
 * Builds StripeWebhookDeps with fakes and drives the REAL
 * handleStripeWebhook (lib/webhooks/stripe-handler.ts, compiled) —
 * the exact module the Next.js adapter calls. No HTTP server, no
 * Stripe, no database: synthetic events + in-memory store/admin.
 *
 * Failure injection (opts):
 *   - cj: 'ok' | 'timeout' | 'notconfigured' | 'flaky'
 *       ok:           createCjOrder returns 'CJ-ORDER-1'
 *       timeout:      throws Error('CJ createOrder timed out after 30000ms')
 *                     (outcome unknown after dispatch)
 *       notconfigured:throws Error('CJ not configured')
 *       flaky:        first call throws timeout, later calls succeed
 *   - storeInject: passed to the memory event store
 *     (effectDoneFails / effectDoneFlaky)
 *   - adminInject: passed to the fake admin (ledgerInsertFails)
 */
import { handleStripeWebhook } from './dist/webhooks/stripe-handler.js';
import { createMemoryEventStore } from './memory-event-store.mjs';
import { createFakeAdmin } from './fake-admin.mjs';

export function makeHarness(opts = {}) {
  const store = createMemoryEventStore({ inject: opts.storeInject ?? {} });
  const admin = createFakeAdmin({ inject: opts.adminInject ?? {} });
  const calls = { cj: 0 };
  let pendingEvent = null;
  let now = opts.nowMs ?? 1_790_000_000_000;

  const cjBehavior = opts.cj ?? 'ok';
  const cjConfigured = cjBehavior !== 'notconfigured';

  const deps = {
    verifySignature: async (_rawBody, signature) => {
      if (signature !== 'sig-ok' || !pendingEvent) throw new Error('bad_signature');
      return pendingEvent;
    },
    store,
    admin,
    retrieveSubscription: async (id) => ({
      id,
      customer: 'cus_test_1',
      status: 'active',
      items: { data: [{ current_period_end: Math.floor(now / 1000) + 30 * 86400 }] },
      metadata: { zervia_tier: 'pro', zervia_interval: 'month' },
    }),
    cjConfigured: () => cjConfigured,
    cjCreateOrder: async (_items, _address, remark) => {
      calls.cj += 1;
      if (cjBehavior === 'timeout') throw new Error('CJ createOrder timed out after 30000ms');
      if (cjBehavior === 'notconfigured') throw new Error('CJ not configured');
      if (cjBehavior === 'flaky' && calls.cj === 1) throw new Error('CJ createOrder timed out after 30000ms');
      return `CJ-ORDER-${calls.cj}:${remark.slice(-8)}`;
    },
    nowMs: () => now,
    testMode: true,
    boostDays: 7,
    featuredWeekDays: 7,
    spotlightDays: 7,
  };

  // Seed a consistent fixture world (synthetic ids only, no PII).
  admin.seed('providers', [{ id: 'prov_1', provider_tier: 'verified' }]);
  admin.seed('listings', [{ id: 'list_1', provider_id: 'prov_1', is_featured: false }]);
  admin.seed('products', [{ id: 'prod_1', cj_product_id: 'cj_p1', cj_variant_id: 'cj_v1', stock: 10 }]);
  admin.seed('product_orders', [{
    id: 'order_1', product_id: 'prod_1', provider_id: 'prov_1', buyer_id: 'user_1',
    quantity: 2, unit_price_cents: 1500, total_cents: 3000, currency: 'cad',
    status: 'pending_payment', ship_name: 'Test Buyer', ship_address: '1 Test St',
    ship_city: 'Calgary', ship_province: 'AB', ship_postal: 'T1X 0L3',
    ship_country: 'CA', ship_phone: '4035550100',
  }]);
  admin.seed('subscriptions', [{
    id: 'subrow_1', provider_id: 'prov_1', user_id: 'user_1',
    stripe_subscription_id: 'sub_1', status: 'active',
  }]);

  return {
    deps, store, admin, calls,
    setNow: (ms) => { now = ms; },
    advance: (ms) => { now += ms; },
    /** Drive one webhook delivery of a synthetic event through the REAL handler. */
    async post(event, signature = 'sig-ok') {
      pendingEvent = event;
      try {
        return await handleStripeWebhook(deps, 'raw-body-bytes', signature);
      } finally {
        pendingEvent = null;
      }
    },
    ledgerRows() {
      return admin.all('transactions');
    },
  };
}

/** Synthetic event builders (no PII, no real Stripe objects). */
export const ev = {
  boostCheckout: (id, overrides = {}) => ({
    id, type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_1', mode: 'payment', payment_intent: 'pi_boost_1',
      amount_total: 1999, currency: 'cad',
      metadata: { zervia_kind: 'boost', zervia_listing_id: 'list_1', zervia_user_id: 'user_1', zervia_provider_id: 'prov_1' },
      ...overrides,
    } },
  }),
  productOrderCheckout: (id, overrides = {}) => ({
    id, type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_2', mode: 'payment', payment_intent: 'pi_order_1',
      amount_total: 3000, currency: 'cad',
      metadata: { zervia_kind: 'product_order', zervia_order_id: 'order_1', zervia_user_id: 'user_1', zervia_provider_id: 'prov_1' },
      ...overrides,
    } },
  }),
  invoicePaid: (id) => ({
    id, type: 'invoice.paid',
    data: { object: {
      id: 'in_1', amount_paid: 2900, currency: 'cad',
      parent: { subscription_details: { subscription: 'sub_1' } },
    } },
  }),
  paymentFailed: (id) => ({
    id, type: 'payment_intent.payment_failed',
    data: { object: { id: 'pi_failed_1', last_payment_error: { message: 'card_declined' } } },
  }),
};
