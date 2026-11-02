/**
 * Harness for the ACTUAL-route PayPal regression tests.
 *
 * Builds PayPalWebhookDeps with fakes and drives the REAL
 * handlePayPalWebhook (lib/webhooks/paypal-handler.ts, compiled) —
 * the exact module the Next.js adapter calls. No HTTP server, no
 * PayPal, no database: synthetic events + in-memory store/admin.
 *
 * Failure injection (opts):
 *   - storeInject: passed to the memory event store
 *     (effectDoneFails / effectDoneFlaky)
 *   - adminInject: passed to the fake admin (ledgerInsertFails)
 *   - configured: false -> admin null (billing not configured -> 503)
 */
import { handlePayPalWebhook } from './dist/webhooks/paypal-handler.js';
import { createMemoryEventStore } from './memory-event-store.mjs';
import { createFakeAdmin } from './fake-admin.mjs';

export function makePayPalHarness(opts = {}) {
  const store = createMemoryEventStore({ inject: opts.storeInject ?? {} });
  const admin = createFakeAdmin({ inject: opts.adminInject ?? {} });
  const configured = opts.configured ?? true;
  let pendingEvent = null;
  let now = opts.nowMs ?? 1_790_000_000_000;

  const deps = {
    verifySignature: async (_rawBody, headers) => {
      if (headers['paypal-transmission-sig'] !== 'sig-ok' || !pendingEvent)
        throw new Error('bad_signature');
      return pendingEvent;
    },
    store,
    admin: configured ? admin : null,
    nowMs: () => now,
    testMode: true,
  };

  return {
    deps,
    store,
    admin,
    setNow: (ms) => {
      now = ms;
    },
    advance: (ms) => {
      now += ms;
    },
    /** Drive one webhook delivery of a synthetic event through the REAL handler. */
    async post(event, signature = 'sig-ok') {
      pendingEvent = event;
      const headers = {
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://certs.example.com/x',
        'paypal-transmission-id': 'tx_test_1',
        'paypal-transmission-sig': signature,
        'paypal-transmission-time': new Date(now).toISOString(),
      };
      try {
        return await handlePayPalWebhook(deps, JSON.stringify(event), headers);
      } finally {
        pendingEvent = null;
      }
    },
    ledgerRows() {
      return admin.all('transactions');
    },
  };
}

/** Synthetic PayPal event builders (no PII, no real PayPal objects). */
export const ppev = {
  capture: (id, overrides = {}) => ({
    id,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'cap_1',
      amount: { currency_code: 'CAD', value: '19.99' },
      custom_id: JSON.stringify({ user_id: 'user_1', provider_id: 'prov_1' }),
      supplementary_data: { related_ids: { order_id: 'pp_order_1' } },
      ...overrides,
    },
  }),
  subActivated: (id, overrides = {}) => ({
    id,
    event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
    resource: {
      id: 'I-SUB1',
      custom_id: JSON.stringify({
        user_id: 'user_1',
        provider_id: 'prov_1',
        tier: 'pro',
        interval: 'month',
      }),
      billing_info: { next_billing_time: '2026-12-01T00:00:00Z' },
      ...overrides,
    },
  }),
  subCancelled: (id, subId = 'I-SUB1') => ({
    id,
    event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
    resource: { id: subId },
  }),
  subSuspended: (id, subId = 'I-SUB1') => ({
    id,
    event_type: 'BILLING.SUBSCRIPTION.SUSPENDED',
    resource: { id: subId },
  }),
};
