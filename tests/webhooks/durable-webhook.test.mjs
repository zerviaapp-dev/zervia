/**
 * Unit tests for the REPAIRED effect engine
 * (lib/webhooks/durable-events.ts — repair branch, Nov 1, 2026).
 *
 * These close the independent review's 2am reproduction (#6555289723):
 * "remote order accepted but response times out ... Second invocation
 * with same effect key repeats external function (externalCalls=2)".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runEffect,
  classifyError,
  classifyExternalError,
  isClaimEligible,
  backoffMs,
  AmbiguousEffectError,
  ExternalUnknownOutcomeError,
  ExternalNotSentError,
  EffectLedgerWriteError,
  EffectOwnershipError,
} from './dist/webhooks/durable-events.js';
import { LedgerConflictError } from './dist/billing/ledger.js';
import { createMemoryEventStore } from './memory-event-store.mjs';

const OWNER = 'lease_test_owner';

async function startedEffect(store, key, owner = OWNER) {
  await store.recordEffectStart(key, 'evt_1', 'cj_create_order', owner, 'idem-1', 'evt_1');
}

// --- ChatGPT's 2am repro, repaired ---------------------------------------

test('timeout after dispatch: second invocation does NOT re-execute (ambiguous)', async () => {
  const store = createMemoryEventStore();
  let externalCalls = 0;
  const flakyRemote = async () => {
    externalCalls += 1;
    // Remote accepted the order but the response timed out.
    throw new ExternalUnknownOutcomeError('CJ createOrder timed out after 30000ms');
  };

  // First invocation: records ambiguous, throws AmbiguousEffectError.
  await assert.rejects(
    () => runEffect(store, 'evt_1', 'cj_create_order', 'k1', flakyRemote, { external: true, ownerToken: OWNER }),
    AmbiguousEffectError
  );
  assert.equal(externalCalls, 1);
  const row = await store.getEffect('k1');
  assert.equal(row.status, 'ambiguous');
  assert.equal(row.failure_kind, 'unknown');

  // Second invocation with the SAME effect key: must NOT re-execute.
  await assert.rejects(
    () => runEffect(store, 'evt_1', 'cj_create_order', 'k1', flakyRemote, { external: true, ownerToken: OWNER }),
    AmbiguousEffectError
  );
  assert.equal(externalCalls, 1, 'ambiguous external effect was re-executed — the 2am defect');
});

test('untyped external timeout defaults to unknown (conservative for money)', async () => {
  const store = createMemoryEventStore();
  let calls = 0;
  const fn = async () => {
    calls += 1;
    throw new Error('socket hang up');
  };
  await assert.rejects(
    () => runEffect(store, 'evt_1', 'x', 'k2', fn, { external: true, ownerToken: OWNER }),
    AmbiguousEffectError
  );
  assert.equal(calls, 1);
  assert.equal((await store.getEffect('k2')).status, 'ambiguous');
});

test('classifyExternalError maps not-sent patterns to ExternalNotSentError', async () => {
  const e = classifyExternalError(new Error('CJ not configured'));
  assert.ok(e instanceof ExternalNotSentError);
});

// --- success-then-ledger-failure is NOT downgraded -------------------------

test('external success + recordEffectDone DB failure -> EffectLedgerWriteError, never failed', async () => {
  const store = createMemoryEventStore({ inject: { effectDoneFails: 99 } });
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return 'CJ-ORDER-9';
  };
  const err = await runEffect(store, 'evt_1', 'cj_create_order', 'k3', fn, { external: true, ownerToken: OWNER })
    .then(() => null, (e) => e);
  assert.ok(err instanceof EffectLedgerWriteError, `expected EffectLedgerWriteError, got ${err}`);
  assert.equal(err.externalId, 'CJ-ORDER-9');
  assert.equal(calls, 1, 'external call must not be repeated');
  const row = await store.getEffect('k3');
  assert.equal(row.status, 'started', 'the old code downgraded this to failed — repaired');
  assert.equal(classifyError(err), false, 'non-retryable: operator reconciles, never auto re-executes');
});

test('transient recordEffectDone failure recovers via bounded retry', async () => {
  const store = createMemoryEventStore({ inject: { effectDoneFlaky: 2 } });
  let calls = 0;
  const out = await runEffect(store, 'evt_1', 'cj_create_order', 'k4', async () => {
    calls += 1;
    return 'CJ-ORDER-4';
  }, { external: true, ownerToken: OWNER });
  assert.equal(out.externalId, 'CJ-ORDER-4');
  assert.equal(out.skipped, false);
  assert.equal(calls, 1);
  assert.equal((await store.getEffect('k4')).status, 'completed');
});

// --- definitely-not-sent CAN be retried ------------------------------------

test('ExternalNotSentError -> failed/not_sent -> second invocation may re-execute', async () => {
  const store = createMemoryEventStore();
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (calls === 1) throw new ExternalNotSentError('CJ rejected: invalid address');
    return 'CJ-ORDER-5';
  };
  await assert.rejects(
    () => runEffect(store, 'evt_1', 'cj_create_order', 'k5', fn, { external: true, ownerToken: OWNER }),
    ExternalNotSentError
  );
  const row = await store.getEffect('k5');
  assert.equal(row.status, 'failed');
  assert.equal(row.failure_kind, 'not_sent');
  const out = await runEffect(store, 'evt_1', 'cj_create_order', 'k5', fn, { external: true, ownerToken: OWNER });
  assert.equal(out.externalId, 'CJ-ORDER-5');
  assert.equal(calls, 2, 'definitely-not-sent effects are safe to retry');
});

// --- fencing: stale workers cannot land effect writes ----------------------

test('effect ownership fencing: stale worker CAS misses', async () => {
  const store = createMemoryEventStore();
  await store.recordEffectStart('k6', 'evt_1', 'cj_create_order', 'owner_A', null, null);
  // Redrive worker B must not overwrite A's row.
  assert.equal(await store.recordEffectStart('k6', 'evt_1', 'cj_create_order', 'owner_B', null, null), false);
  // B's completion misses (wrong owner token).
  assert.equal(await store.recordEffectDone('k6', 'CJ-X', 'owner_B'), false);
  // A's completion lands.
  assert.equal(await store.recordEffectDone('k6', 'CJ-X', 'owner_A'), true);
  assert.equal((await store.getEffect('k6')).status, 'completed');
});

test('completed effect is skipped, fn never re-runs', async () => {
  const store = createMemoryEventStore();
  let calls = 0;
  await runEffect(store, 'evt_1', 'x', 'k7', async () => { calls += 1; return 'E1'; }, { external: true, ownerToken: OWNER });
  const out = await runEffect(store, 'evt_1', 'x', 'k7', async () => { calls += 1; return 'E2'; }, { external: true, ownerToken: OWNER });
  assert.equal(out.skipped, true);
  assert.equal(out.externalId, 'E1');
  assert.equal(calls, 1);
});

test('internal idempotent effect re-executes after started (crash recovery)', async () => {
  const store = createMemoryEventStore();
  let calls = 0;
  await store.recordEffectStart('k8', 'evt_1', 'mirror_subscription', OWNER, null, null);
  const out = await runEffect(store, 'evt_1', 'mirror_subscription', 'k8', async () => {
    calls += 1;
    return null;
  }, { external: false, ownerToken: OWNER });
  assert.equal(calls, 1);
  assert.equal((await store.getEffect('k8')).status, 'completed');
  assert.equal(out.skipped, false);
});

// --- classifyError routing ---------------------------------------------------

test('classifyError: ambiguity/ledger-write/unknown/conflict are non-retryable', async () => {
  assert.equal(classifyError(new AmbiguousEffectError('k')), false);
  assert.equal(classifyError(new EffectLedgerWriteError('k', 'E1', 'db down')), false);
  assert.equal(classifyError(new ExternalUnknownOutcomeError('timeout')), false);
  assert.equal(classifyError(new LedgerConflictError('k', {}, {})), false);
  assert.equal(classifyError(new Error('bad_signature')), false);
  assert.equal(classifyError(new Error('billing_not_configured')), false);
  assert.equal(classifyError(new EffectOwnershipError('k')), true, 'stale worker: 500 so a fresh delivery re-claims');
  assert.equal(classifyError(new Error('transient db outage')), true);
});

// --- claim predicate + backoff (unchanged semantics) -------------------------

test('isClaimEligible truth table', async () => {
  const now = 1_790_000_000_000;
  const base = { retryable: true, next_attempt_at: null, lease_expires_at: null };
  assert.equal(isClaimEligible({ ...base, state: 'completed' }, now), false);
  assert.equal(isClaimEligible({ ...base, state: 'received' }, now), true);
  assert.equal(isClaimEligible({ ...base, state: 'failed', next_attempt_at: new Date(now - 1000).toISOString() }, now), true);
  assert.equal(isClaimEligible({ ...base, state: 'failed', next_attempt_at: new Date(now + 60000).toISOString() }, now), false);
  assert.equal(isClaimEligible({ ...base, state: 'failed', retryable: false }, now), false);
  assert.equal(isClaimEligible({ ...base, state: 'processing', lease_expires_at: new Date(now - 1000).toISOString() }, now), true);
  assert.equal(isClaimEligible({ ...base, state: 'processing', lease_expires_at: new Date(now + 60000).toISOString() }, now), false);
});

test('backoffMs: 30s doubling, 1h cap', async () => {
  assert.equal(backoffMs(1), 30_000);
  assert.equal(backoffMs(2), 60_000);
  assert.equal(backoffMs(10), 3_600_000);
});
