/**
 * ACTUAL-ROUTE PayPal regression tests (repair branch, Nov 1, 2026).
 *
 * These execute the REAL handler — handlePayPalWebhook from
 * lib/webhooks/paypal-handler.ts (the exact module the Next.js route
 * adapter calls) — with injected fakes. They close P1-3: the old route
 * had no status machine, no lease, no retry, and no manual-review
 * queue — handler failures were console.error'd and the route still
 * returned 200 {received:true}, silently swallowing failed money
 * events. Every failure path below must surface as 500 or an explicit
 * 200/manualReview — never a silent success 200.
 *
 * Synthetic fixtures only. No network, no database, no PII.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePayPalHarness, ppev } from './paypal-harness.mjs';

test('bad signature -> 400, never touches the ledger', async () => {
  const h = makePayPalHarness();
  const r = await h.post(ppev.capture('pp_sig_1'), 'sig-wrong');
  assert.equal(r.http, 400);
  assert.equal(h.ledgerRows().length, 0);
  assert.equal(h.store._events.size, 0, 'unverified request registers nothing');
});

test('missing signature -> 400', async () => {
  const h = makePayPalHarness();
  const r = await h.post(ppev.capture('pp_nosig_1'), null);
  assert.equal(r.http, 400);
  assert.equal(h.ledgerRows().length, 0);
});

test('billing not configured -> 503', async () => {
  const h = makePayPalHarness({ configured: false });
  const r = await h.post(ppev.capture('pp_503_1'));
  assert.equal(r.http, 503);
});

test('capture completed -> 200, one ledger row; redelivery dedupes', async () => {
  const h = makePayPalHarness();
  const e = ppev.capture('pp_cap_1');
  const r1 = await h.post(e);
  assert.equal(r1.http, 200);
  assert.equal(r1.body.received, true);
  const r2 = await h.post(e); // PayPal redelivery of the same event
  assert.equal(r2.http, 200);
  assert.equal(r2.body.deduped, true);
  const rows = h.ledgerRows();
  assert.equal(rows.length, 1, `expected 1 ledger row, got ${rows.length}`);
  assert.equal(rows[0].amount_cents, 1999);
  assert.ok(rows[0].effect_key.includes(':paypal:'), 'effect key names the provider');
  assert.ok(rows[0].effect_key.includes(':boost:cap_1'));
  assert.equal(rows[0].user_id, 'user_1');
  assert.equal(rows[0].provider_id, 'prov_1');
});

test('capture for already-known order -> skipped, no duplicate row', async () => {
  const h = makePayPalHarness();
  h.admin.seed('paypal_orders', [{ id: 'po_1', paypal_order_id: 'pp_order_1', kind: 'capture', provider_id: 'prov_1' }]);
  const r = await h.post(ppev.capture('pp_known_1'));
  assert.equal(r.http, 200);
  assert.equal(h.ledgerRows().length, 0, 'order already fulfilled by the capture route');
});

test('capture without custom ids -> 200, no ledger row', async () => {
  const h = makePayPalHarness();
  const r = await h.post(ppev.capture('pp_nocustom_1', { custom_id: '{}' }));
  assert.equal(r.http, 200);
  assert.equal(h.ledgerRows().length, 0);
});

test('subscription activated -> 200, subscription mirrored + one ledger row', async () => {
  const h = makePayPalHarness();
  const r = await h.post(ppev.subActivated('pp_sub_1'));
  assert.equal(r.http, 200);
  const sub = h.admin.all('subscriptions').find((s) => s.stripe_subscription_id === 'paypal:I-SUB1');
  assert.ok(sub, 'subscription row mirrored');
  assert.equal(sub.tier, 'pro');
  assert.equal(sub.status, 'active');
  const rows = h.ledgerRows().filter((x) => x.type === 'subscription');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].effect_key.includes(':paypal:'));
  assert.ok(rows[0].effect_key.includes(':subscription:I-SUB1'));
});

test('duplicate subscription activation -> deduped, one ledger row', async () => {
  const h = makePayPalHarness();
  const e = ppev.subActivated('pp_subdup_1');
  assert.equal((await h.post(e)).http, 200);
  const r2 = await h.post(e);
  assert.equal(r2.body.deduped, true);
  assert.equal(h.ledgerRows().filter((x) => x.type === 'subscription').length, 1);
});

test('subscription cancelled -> local status updated', async () => {
  const h = makePayPalHarness();
  h.admin.seed('subscriptions', [{
    id: 'subrow_9', provider_id: 'prov_1', user_id: 'user_1',
    stripe_subscription_id: 'paypal:I-SUB1', status: 'active',
  }]);
  const r = await h.post(ppev.subCancelled('pp_cancel_1'));
  assert.equal(r.http, 200);
  const sub = h.admin.all('subscriptions').find((s) => s.stripe_subscription_id === 'paypal:I-SUB1');
  assert.equal(sub.status, 'canceled');
});

test('subscription suspended -> local status updated', async () => {
  const h = makePayPalHarness();
  h.admin.seed('subscriptions', [{
    id: 'subrow_9', provider_id: 'prov_1', user_id: 'user_1',
    stripe_subscription_id: 'paypal:I-SUB1', status: 'active',
  }]);
  const r = await h.post(ppev.subSuspended('pp_susp_1'));
  assert.equal(r.http, 200);
  const sub = h.admin.all('subscriptions').find((s) => s.stripe_subscription_id === 'paypal:I-SUB1');
  assert.equal(sub.status, 'suspended');
});

test('ledger insert failure -> 500 (never silent 200), redelivery credits exactly once', async () => {
  const h = makePayPalHarness({ adminInject: { ledgerInsertFails: 1 } });
  const e = ppev.subActivated('pp_ledfail_1');
  const r1 = await h.post(e);
  assert.equal(r1.http, 500, 'ledger failures propagate (loud) — the old code swallowed this into 200');
  assert.ok(!r1.body.received, 'must NOT look like a success');
  assert.equal(h.ledgerRows().length, 0);
  // Immediate redelivery arrives before the backoff elapses -> deferred.
  const rEarly = await h.post(e);
  assert.equal(rEarly.body.deferred, true);
  // PayPal retries after the backoff: the upsert is idempotent and the
  // ledger insert lands exactly once.
  h.advance(31_000);
  const r2 = await h.post(e);
  assert.equal(r2.http, 200);
  const rows = h.ledgerRows().filter((x) => x.type === 'subscription');
  assert.equal(rows.length, 1, 'idempotent redelivery: exactly one credit');
});

test('inconsistent repeat payload -> manualReview, never silent', async () => {
  const h = makePayPalHarness();
  const r1 = await h.post(ppev.capture('pp_conf_1'));
  assert.equal(r1.http, 200);
  // Same business effect key (same capture id) but a DIFFERENT amount,
  // delivered as a new event id.
  const tampered = ppev.capture('pp_conf_2', {
    supplementary_data: { related_ids: { order_id: 'pp_order_2' } },
    amount: { currency_code: 'CAD', value: '99.99' },
  });
  const r2 = await h.post(tampered);
  assert.equal(r2.http, 200);
  assert.equal(r2.body.manualReview, true, 'inconsistent duplicate -> human reconciliation, flagged');
  const rows = h.ledgerRows();
  assert.equal(rows.length, 1, 'conflicting repeat must not mint a second row');
  assert.equal(rows[0].amount_cents, 1999, 'original amount preserved');
});

test('unknown event type -> 200 received, no writes', async () => {
  const h = makePayPalHarness();
  const r = await h.post({ id: 'pp_unk_1', event_type: 'PLAN.UPDATED', resource: {} });
  assert.equal(r.http, 200);
  assert.equal(r.body.received, true);
  assert.equal(h.ledgerRows().length, 0);
});
