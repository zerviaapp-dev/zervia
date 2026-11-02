/**
 * ACTUAL-ROUTE regression tests (repair branch, Nov 1, 2026).
 *
 * These execute the REAL handler — handleStripeWebhook from
 * lib/webhooks/stripe-handler.ts (the exact module the Next.js route
 * adapter calls) — with injected fakes. Per the independent review
 * (#6557697448): "Real route/adapter regressions must inject
 * external-success/timeout, ledger failure after external success,
 * duplicate events, concurrent claims, expired leases, stale workers
 * and crash/restart."
 *
 * Synthetic fixtures only. No network, no database, no PII.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHarness, ev } from './route-harness.mjs';
import { ledgerEffectKey, recordTransaction } from './dist/billing/ledger.js';

test('duplicate delivery -> exactly one ledger credit (boost)', async () => {
  const h = makeHarness();
  const e = ev.boostCheckout('evt_dup_1');
  const r1 = await h.post(e);
  assert.equal(r1.http, 200);
  assert.equal(r1.body.received, true);
  const r2 = await h.post(e); // Stripe redelivery of the same event
  assert.equal(r2.http, 200);
  assert.equal(r2.body.deduped, true);
  const rows = h.ledgerRows();
  assert.equal(rows.length, 1, `expected 1 ledger row, got ${rows.length}`);
  assert.equal(rows[0].amount_cents, 1999);
  assert.ok(rows[0].effect_key.includes(':boost:pi_boost_1'));
});

test('concurrent duplicate deliveries -> one winner, one ledger row', async () => {
  const h = makeHarness();
  const e = ev.boostCheckout('evt_conc_1');
  const [a, b] = await Promise.all([h.post(e), h.post(e)]);
  const https = [a.http, b.http].sort();
  assert.deepEqual(https, [200, 200]);
  const bodies = [a.body, b.body];
  const processed = bodies.filter((x) => x.received && !x.deduped && !x.deferred).length;
  assert.ok(processed >= 1, 'at least one delivery processes the event');
  assert.equal(h.ledgerRows().length, 1, 'concurrent duplicates must not double-credit');
});

test('timeout after dispatch -> manualReview, never re-executed, redrive deferred', async () => {
  const h = makeHarness({ cj: 'timeout' });
  const e = ev.productOrderCheckout('evt_amb_1');
  const r1 = await h.post(e);
  assert.equal(r1.http, 200);
  assert.equal(r1.body.manualReview, true, 'ambiguous external effect -> manual review, not 500');
  assert.equal(h.calls.cj, 1);
  const effect = await h.store.getEffect(`cj_create_order:evt_amb_1:order_1`);
  assert.equal(effect.status, 'ambiguous');
  assert.ok(effect.idempotency_key, 'dispatch identity persisted before the call');

  // Redelivery: the event is failed non-retryable -> deferred, CJ untouched.
  const r2 = await h.post(e);
  assert.equal(r2.http, 200);
  assert.equal(r2.body.deferred, true);
  assert.equal(h.calls.cj, 1, 'ambiguous external effect re-executed on redrive — the 2am defect');
  // No ledger credit for the unfulfilled order.
  assert.equal(h.ledgerRows().length, 0);
});

test('crash between external response and ledger write -> manualReview, effect stays started', async () => {
  const h = makeHarness({ cj: 'ok', storeInject: { effectDoneFails: 99 } });
  const e = ev.productOrderCheckout('evt_crash_1');
  const r1 = await h.post(e);
  assert.equal(r1.http, 200);
  assert.equal(r1.body.manualReview, true, 'success-then-ledger-failure is non-retryable');
  assert.equal(h.calls.cj, 1);
  const effect = await h.store.getEffect(`cj_create_order:evt_crash_1:order_1`);
  assert.equal(effect.status, 'started', 'must NOT be downgraded to failed');
  // Restart/redelivery: still exactly one external call.
  const r2 = await h.post(e);
  assert.equal(r2.http, 200);
  assert.equal(h.calls.cj, 1);
  const evt = h.store._events.get('evt_crash_1');
  assert.equal(evt.state, 'failed');
  assert.equal(evt.retryable, false);
});

test('transient effect-ledger failure recovers -> event completes', async () => {
  const h = makeHarness({ cj: 'ok', storeInject: { effectDoneFlaky: 2 } });
  const e = ev.productOrderCheckout('evt_flaky_1');
  const r1 = await h.post(e);
  assert.equal(r1.http, 200);
  assert.equal(r1.body.received, true);
  assert.equal(h.calls.cj, 1);
  const effect = await h.store.getEffect(`cj_create_order:evt_flaky_1:order_1`);
  assert.equal(effect.status, 'completed');
  assert.equal(h.ledgerRows().length, 1, 'one ledger credit for the fulfilled order');
});

test('ledger insert failure -> 500, redelivery credits exactly once', async () => {
  const h = makeHarness({ adminInject: { ledgerInsertFails: 1 } });
  const e = ev.boostCheckout('evt_led_1');
  const r1 = await h.post(e);
  assert.equal(r1.http, 500, 'ledger failures propagate (loud), never silent');
  assert.equal(h.ledgerRows().length, 0);
  // Immediate redelivery arrives before the backoff elapses -> deferred.
  const rEarly = await h.post(e);
  assert.equal(rEarly.body.deferred, true);
  assert.equal(h.ledgerRows().length, 0);
  // Stripe retries after the backoff: the guarded activation is
  // idempotent and the ledger insert lands exactly once.
  h.advance(31_000);
  const r2 = await h.post(e);
  assert.equal(r2.http, 200);
  const rows = h.ledgerRows();
  assert.equal(rows.length, 1, 'idempotent redelivery: exactly one credit');
});

test('inconsistent repeat payload -> LedgerConflictError -> manualReview', async () => {
  const h = makeHarness();
  const r1 = await h.post(ev.boostCheckout('evt_conf_1'));
  assert.equal(r1.http, 200);
  // Same business effect key (same pi id) but a DIFFERENT amount.
  const tampered = ev.boostCheckout('evt_conf_2', { payment_intent: 'pi_boost_1', amount_total: 9999 });
  const r2 = await h.post(tampered);
  assert.equal(r2.http, 200);
  assert.equal(r2.body.manualReview, true, 'inconsistent duplicate -> human reconciliation');
  const rows = h.ledgerRows();
  assert.equal(rows.length, 1, 'conflicting repeat must not mint a second row');
  assert.equal(rows[0].amount_cents, 1999, 'original amount preserved');
});

test('expired lease -> redrive claims and completes; stale completion rejected', async () => {
  const h = makeHarness();
  const e = ev.boostCheckout('evt_lease_1');
  // Worker A claims but crashes before beginProcessing completes the work.
  const reg = await h.store.register(e.id, e.type);
  assert.equal(reg.state, 'received');
  const claimA = await h.store.claim(e.id, 'token_A', 60_000, 'worker-a', h.deps.nowMs());
  assert.equal(claimA.claimed, true);

  // Delivery while A holds a live lease -> deferred.
  const r1 = await h.post(e);
  assert.equal(r1.http, 200);
  assert.equal(r1.body.deferred, true);
  assert.equal(h.ledgerRows().length, 0);

  // A's lease expires (crash). Next delivery redrives and completes.
  h.store.expireLease(e.id, h.deps.nowMs());
  const r2 = await h.post(e);
  assert.equal(r2.http, 200);
  assert.equal(r2.body.received, true);
  assert.equal(h.ledgerRows().length, 1);

  // Stale worker A can never complete over the replacement.
  assert.equal(await h.store.complete(e.id, 'token_A'), false);
});

test('invoice.paid renewal -> duplicate delivery credits once', async () => {
  const h = makeHarness();
  const e = ev.invoicePaid('evt_inv_1');
  assert.equal((await h.post(e)).http, 200);
  const r2 = await h.post(e);
  assert.equal(r2.body.deduped, true);
  const rows = h.ledgerRows().filter((r) => r.type === 'subscription');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].effect_key.includes(':subscription:in_1'));
});

test('payment_intent.payment_failed marks the pending transaction failed', async () => {
  const h = makeHarness();
  h.admin.seed('transactions', [{
    id: 'tx_pend_1', user_id: 'user_1', provider_id: 'prov_1',
    effect_key: 'seed:pending', stripe_payment_intent_id: 'pi_failed_1',
    amount_cents: 1999, currency: 'cad', type: 'boost', status: 'pending',
  }]);
  const r = await h.post(ev.paymentFailed('evt_pif_1'));
  assert.equal(r.http, 200);
  const row = h.admin.all('transactions').find((t) => t.id === 'tx_pend_1');
  assert.equal(row.status, 'failed');
});

test('ledger keys: refund distinct from capture (business effect identity)', async () => {
  const h = makeHarness();
  const capKey = ledgerEffectKey({ provider: 'stripe', testMode: true, merchantScope: 'prov_1', effectType: 'subscription', providerEffectId: 'pi_cap_1' });
  const refKey = ledgerEffectKey({ provider: 'stripe', testMode: true, merchantScope: 'prov_1', effectType: 'refund', providerEffectId: 're_1' });
  assert.notEqual(capKey, refKey);
  await recordTransaction(h.admin, {
    user_id: 'user_1', provider_id: 'prov_1', effect_key: capKey,
    amount_cents: 2900, currency: 'cad', type: 'subscription', status: 'succeeded',
  });
  await recordTransaction(h.admin, {
    user_id: 'user_1', provider_id: 'prov_1', effect_key: refKey,
    amount_cents: 2900, currency: 'cad', type: 'refund', status: 'succeeded',
  });
  assert.equal(h.ledgerRows().length, 2, 'refund and capture are separate ledger rows');
  // Exact duplicate of the capture is idempotent.
  const again = await recordTransaction(h.admin, {
    user_id: 'user_1', provider_id: 'prov_1', effect_key: capKey,
    amount_cents: 2900, currency: 'cad', type: 'subscription', status: 'succeeded',
  });
  assert.equal(h.ledgerRows().length, 2);
  assert.ok(again.id, 'idempotent repeat returns the existing row');
});

test('bad signature -> 400, never touches the ledger', async () => {
  const h = makeHarness();
  const r = await h.post(ev.boostCheckout('evt_sig_1'), 'sig-wrong');
  assert.equal(r.http, 400);
  assert.equal(h.ledgerRows().length, 0);
  assert.equal(h.store._events.size, 0, 'unverified request registers nothing');
});

test('billing not configured -> 503', async () => {
  const h = makeHarness();
  h.deps.admin = null;
  const r = await h.post(ev.boostCheckout('evt_503_1'));
  assert.equal(r.http, 503);
});
