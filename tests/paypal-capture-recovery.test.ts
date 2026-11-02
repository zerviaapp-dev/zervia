/**
 * Recovery/durability tests for the PayPal capture status machine —
 * `runCaptureFlow` in lib/billing/capture-idempotency.ts (Nov 2, 2026
 * repair of the confirmed defect: a duplicate idempotency claim STILL
 * called the PayPal capture API).
 *
 * No test runner is installed in this app — run with Node's built-in
 * runner + type stripping (Node >= 22):
 *   node --experimental-strip-types --test tests/paypal-capture-recovery.test.ts
 *
 * The module under test is import-free by design; the Supabase admin
 * and the PayPal API are injected fakes — no network, no database, no
 * real charges. The fake DB executes updates synchronously (no await
 * between filter and apply), so its compare-and-set updates are atomic
 * under JS concurrency, exactly like Postgres row-level atomicity for
 * the single-statement UPDATEs the flow issues.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore - Node strip-types resolves the .ts extension at runtime.
import {
  runCaptureFlow,
  setCompletionColumnsOverride,
  setTransactionColumnOverride,
  type FlowAdmin,
  type FlowCapture,
} from '../lib/billing/capture-idempotency.ts';

type Row = {
  paypal_order_id: string;
  kind: string;
  provider_id: string;
  status: string;
  capture_id: string | null;
  captured_at: string | null;
  fulfilled_at: string | null;
};

function seedRow(status: string): Row {
  return {
    paypal_order_id: 'ORDER-1',
    kind: 'boost',
    provider_id: 'prov_1',
    status,
    capture_id: status === 'claimed' ? null : 'CAP-1',
    captured_at: status === 'claimed' ? null : '2026-11-02T00:00:00.000Z',
    fulfilled_at: status === 'fulfilled' ? '2026-11-02T00:00:01.000Z' : null,
  };
}

/** In-memory paypal_orders with atomic compare-and-set updates. */
function makeDb(opts: {
  insertError?: { code?: string; message: string } | null;
  completionColumns?: boolean;
  txRows?: Array<{ id: string; paypal_order_id?: string; status?: string }>;
} = {}) {
  const rows = new Map<string, Row>();
  const txRows = opts.txRows ?? [];
  const completionColumns = opts.completionColumns ?? true;
  const db = {
    rows,
    txRows,
    from(table: string) {
      if (table === 'transactions') {
        // Minimal fake for the probe (select paypal_order_id limit 0)
        // and the ledger guard (eq paypal_order_id, eq status, limit 1).
        if (!completionColumns) {
          return {
            select(_cols: string) {
              return {
                eq() { return this; },
                async limit() {
                  return {
                    data: null,
                    error: { code: '42703', message: 'column "paypal_order_id" does not exist' },
                  };
                },
              };
            },
          };
        }
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push((r) => r[col] === val);
            return chain;
          },
          async limit(n: number) {
            const found = (txRows as Record<string, unknown>[]).filter((r) =>
              filters.every((f) => f(r))
            );
            return { data: found.slice(0, n), error: null };
          },
        };
        return { select(_cols: string) { return chain; } };
      }
      assert.equal(table, 'paypal_orders');
      return {
        insert(row: Record<string, unknown>) {
          const id = row.paypal_order_id as string;
          let error: { code?: string; message: string } | null = null;
          if (opts.insertError) {
            error = opts.insertError;
          } else if (rows.has(id)) {
            error = {
              code: '23505',
              message:
                'duplicate key value violates unique constraint "paypal_orders_pkey"',
            };
          } else {
            rows.set(id, {
              paypal_order_id: id,
              kind: row.kind as string,
              provider_id: row.provider_id as string,
              status: row.status as string,
              capture_id: null,
              captured_at: null,
              fulfilled_at: null,
            });
          }
          return {
            select(_cols: string) {
              return {
                single: async () => ({
                  data: error ? null : { paypal_order_id: id },
                  error,
                }),
              };
            },
          };
        },
        select(_cols: string) {
          return {
            eq(col: string, val: unknown) {
              return {
                single: async () => {
                  assert.equal(col, 'paypal_order_id');
                  const r = rows.get(val as string);
                  if (!r) {
                    return {
                      data: null,
                      error: { code: 'PGRST116', message: 'no rows' },
                    };
                  }
                  return { data: { status: r.status }, error: null };
                },
              };
            },
            // Column probe: select('status,capture_id').limit(0).
            async limit(_n: number) {
              if (!completionColumns && /status|capture_id/.test(_cols)) {
                return {
                  data: null,
                  error: { code: '42703', message: 'column "status" does not exist' },
                };
              }
              return { data: [], error: null };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          const filters: Array<(r: Row) => boolean> = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
              return chain;
            },
            in(col: string, vals: unknown[]) {
              filters.push((r) =>
                (vals as unknown[]).includes(
                  (r as unknown as Record<string, unknown>)[col]
                )
              );
              return chain;
            },
            // Synchronous filter+apply: atomic under JS concurrency.
            select(_cols?: string) {
              const matched = [...rows.values()].filter((r) =>
                filters.every((f) => f(r))
              );
              for (const r of matched) Object.assign(r, patch);
              return Promise.resolve({
                data: matched.map((r) => ({ paypal_order_id: r.paypal_order_id })),
                error: null,
              });
            },
          };
          return chain;
        },
      };
    },
  };
  return db;
}

const GOOD_CAPTURE: FlowCapture = {
  id: 'CAP-1',
  status: 'COMPLETED',
  amountValue: '9.00',
  amountCurrency: 'CAD',
};

function makeDeps(
  db: ReturnType<typeof makeDb>,
  opts: {
    captureResponse?: FlowCapture;
    orderCapture?: FlowCapture | null;
    authorizedAmount?: { value?: string; currency_code?: string } | null;
    crashInResolveExpected?: boolean;
    fulfillBehavior?: 'ok' | 'throw';
    captureBehavior?: 'ok' | 'throw';
  } = {}
) {
  const calls = { captures: 0, fulfills: 0, fulfillArgs: [] as unknown[] };
  const captureResponse = opts.captureResponse ?? GOOD_CAPTURE;
  const deps = {
    admin: db as unknown as FlowAdmin,
    orderId: 'ORDER-1',
    custom: {
      kind: 'boost' as const,
      user_id: 'user_1',
      provider_id: 'prov_1',
      listing_id: 'listing_1',
      currency: 'cad',
    },
    description: 'Featured boost (7 days) — via PayPal',
    captureOrder: async (_orderId: string): Promise<FlowCapture> => {
      calls.captures++;
      if (opts.captureBehavior === 'throw') throw new Error('paypal timeout after dispatch');
      return { ...captureResponse };
    },
    orderCapture: opts.orderCapture ?? null,
    authorizedAmount: opts.authorizedAmount ?? { value: '9.00', currency_code: 'CAD' },
    fulfill: async (args: unknown) => {
      calls.fulfills++;
      calls.fulfillArgs.push(args);
      if (opts.fulfillBehavior === 'throw') {
        throw new Error('[paypal] transaction insert failed for order ORDER-1: db down');
      }
    },
    resolveExpected: async () => {
      if (opts.crashInResolveExpected) {
        throw new Error('simulated crash resolving server truth');
      }
      return { expectedCents: 900, currency: 'cad' };
    },
    toPayPalValue: (cents: number) => (cents / 100).toFixed(2),
    log: () => {},
    pollDelayMs: 1,
  };
  return { deps, calls };
}

test('first sighting: capture + fulfill exactly once, row ends fulfilled', async () => {
  const db = makeDb();
  const { deps, calls } = makeDeps(db);
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, true);
  assert.equal(calls.captures, 1);
  assert.equal(calls.fulfills, 1);
  const row = db.rows.get('ORDER-1')!;
  assert.equal(row.status, 'fulfilled');
  assert.equal(row.capture_id, 'CAP-1');
  assert.ok(row.captured_at);
  assert.ok(row.fulfilled_at);
  // Fulfillment received the capture id + server-truth amount.
  assert.deepEqual(calls.fulfillArgs[0], {
    kind: 'boost',
    userId: 'user_1',
    providerId: 'prov_1',
    listingId: 'listing_1',
    paypalOrderId: 'ORDER-1',
    paypalCaptureId: 'CAP-1',
    amountCents: 900,
    currency: 'cad',
    description: 'Featured boost (7 days) — via PayPal',
  });
});

test('duplicate claim on a fulfilled order → success with ZERO capture calls', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', seedRow('fulfilled'));
  const { deps, calls } = makeDeps(db);
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, true);
  assert.equal(calls.captures, 0);
  assert.equal(calls.fulfills, 0);
  assert.equal(res.captureCalls, 0);
  assert.equal(res.fulfillCalls, 0);
});

test('duplicate claim on a captured order → crash recovery fulfills once, no re-capture', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', seedRow('captured'));
  const { deps, calls } = makeDeps(db, { orderCapture: { ...GOOD_CAPTURE } });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, true);
  assert.equal(calls.captures, 0);
  assert.equal(calls.fulfills, 1);
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});

test('duplicate claim on a claimed order → exactly 1 capture + 1 fulfillment', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', seedRow('claimed'));
  const { deps, calls } = makeDeps(db);
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, true);
  assert.equal(calls.captures, 1);
  assert.equal(calls.fulfills, 1);
  const row = db.rows.get('ORDER-1')!;
  assert.equal(row.status, 'fulfilled');
  assert.equal(row.capture_id, 'CAP-1');
});

test('server-truth read crashes → rejects before claim/capture; retry succeeds', async () => {
  const db = makeDb();
  const first = makeDeps(db, { crashInResolveExpected: true });
  await assert.rejects(() => runCaptureFlow(first.deps), /simulated crash/);
  assert.equal(first.calls.captures, 0);
  assert.equal(db.rows.size, 0, 'no claim row written before server truth resolves');
  const second = makeDeps(db);
  const res = await runCaptureFlow(second.deps);
  assert.equal(res.ok, true);
  assert.equal(second.calls.captures, 1);
  assert.equal(second.calls.fulfills, 1);
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});

test('pre-capture amount validation: authorized != server truth → abort before claim AND capture', async () => {
  const db = makeDb();
  const { deps, calls } = makeDeps(db, {
    authorizedAmount: { value: '99.00', currency_code: 'CAD' },
  });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'auth_amount_mismatch');
  assert.equal(calls.captures, 0);
  assert.equal(calls.fulfills, 0);
  assert.equal(db.rows.size, 0, 'no claim row for a tampered order');
});

test('first sighting holds capturing during capture: duplicate mid-capture issues NO second capture', async () => {
  const db = makeDb();
  let releaseCapture: () => void = () => {};
  const gate = new Promise<void>((r) => { releaseCapture = r; });
  const mk = () => {
    const { deps, calls } = makeDeps(db);
    const orig = deps.captureOrder;
    deps.captureOrder = async (id: string) => {
      const p = orig(id);
      await gate;
      return p;
    };
    return { deps, calls };
  };
  const a = mk();
  const b = mk();
  b.deps.pollDelayMs = 10; // 8 polls x 10ms = 80ms window, longer than the gate hold
  const pA = runCaptureFlow(a.deps); // first sighting: claims, takes capturing, enters gate
  await new Promise((r) => setTimeout(r, 25));
  const pB = runCaptureFlow(b.deps); // duplicate arrives mid-capture
  await new Promise((r) => setTimeout(r, 10)); // B is now polling on 'capturing'
  releaseCapture(); // A completes: capture -> markCaptured -> fulfill -> fulfilled
  const [ra, rb] = await Promise.all([pA, pB]);
  assert.equal(ra.ok, true, `A: ${!ra.ok ? ra.reason : 'ok'}`);
  assert.equal(rb.ok, true, `B loser resolves via winner: ${!rb.ok ? rb.reason : 'ok'}`);
  assert.equal(a.calls.captures + b.calls.captures, 1, 'exactly one capture call total');
  assert.equal(a.calls.fulfills + b.calls.fulfills, 1, 'exactly one fulfill total');
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});

test('race loser on a dead owner (stuck capturing) → FAIL, never false success', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', {
    paypal_order_id: 'ORDER-1',
    kind: 'boost',
    provider_id: 'prov_1',
    status: 'capturing', // owner won the race then died before capturing
    capture_id: null,
    captured_at: null,
    fulfilled_at: null,
  });
  const { deps, calls } = makeDeps(db);
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false, 'a stuck non-terminal row must not report success');
  assert.equal(res.reason, 'race_unresolved_capturing');
  assert.equal(calls.captures, 0, 'loser never captures');
  assert.equal(calls.fulfills, 0, 'loser never fulfills');
});

test('capture throw → lease released (claimed); retry re-attempts capture', async () => {
  // Peer 74760d84: on capture failure without a COMPLETED capture, the
  // lease is released (capturing→claimed) so a buyer retry re-attempts
  // instead of hitting a terminal 'failed'. PayPal dedupes per order.
  const db = makeDb();
  const { deps, calls } = makeDeps(db, { captureBehavior: 'throw' });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'capture_failed');
  const row = db.rows.get('ORDER-1')!;
  assert.equal(row.status, 'claimed', 'lease released for retry');
  const retry = makeDeps(db);
  const res2 = await runCaptureFlow(retry.deps);
  assert.equal(res2.ok, true, `retry succeeds: ${!res2.ok ? res2.reason : 'ok'}`);
  assert.equal(calls.captures + retry.calls.captures, 2, 'retry re-attempts capture');
  assert.equal(retry.calls.fulfills, 1);
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});

test('fulfill throws (loud ledger) → failed; no silent partial state', async () => {
  const db = makeDb();
  const { deps, calls } = makeDeps(db, { fulfillBehavior: 'throw' });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'fulfill_failed');
  assert.equal(calls.captures, 1);
  const row = db.rows.get('ORDER-1')!;
  assert.equal(row.status, 'failed', 'act-then-mark: failed, never a lying fulfilled row');
});

test('duplicate on a failed row → already_failed, never re-captured', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', {
    paypal_order_id: 'ORDER-1',
    kind: 'boost',
    provider_id: 'prov_1',
    status: 'failed',
    capture_id: 'CAP-1',
    captured_at: '2026-11-02T00:00:00.000Z',
    fulfilled_at: null,
  });
  const { deps, calls } = makeDeps(db);
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'already_failed');
  assert.equal(calls.captures, 0);
  assert.equal(calls.fulfills, 0);
});

test('captured recovery with ledger row present → skips fulfill, converges to fulfilled', async () => {
  const db = makeDb({
    txRows: [{ id: 'tx-1', paypal_order_id: 'ORDER-1', status: 'succeeded' }],
  });
  db.rows.set('ORDER-1', {
    paypal_order_id: 'ORDER-1',
    kind: 'boost',
    provider_id: 'prov_1',
    status: 'captured',
    capture_id: 'CAP-1',
    captured_at: '2026-11-02T00:00:00.000Z',
    fulfilled_at: null,
  });
  const { deps, calls } = makeDeps(db, { orderCapture: { ...GOOD_CAPTURE } });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, true);
  assert.equal(calls.captures, 0);
  assert.equal(calls.fulfills, 0, 'ledger guard prevents double-fulfill');
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});

test('pre-migration (columns absent) → FAIL CLOSED: zero captures, zero fulfills, no false success', async () => {
  // Independent-review hardening (Nov 2): the migration gate fails
  // closed. This supersedes the Nov 1 degrade-to-success behavior (a
  // confirmed false-success defect). Clear the module's per-process
  // probe cache so this test exercises the fake's real 42703 probe path.
  setCompletionColumnsOverride(null);
  setTransactionColumnOverride(null);
  const db = makeDb({ completionColumns: false });
  try {
    const first = makeDeps(db);
    const r1 = await runCaptureFlow(first.deps);
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'migration_required');
    assert.equal(first.calls.captures, 0, 'pre-migration: no capture call');
    assert.equal(first.calls.fulfills, 0, 'pre-migration: no fulfill');
    assert.equal(db.rows.size, 0, 'pre-migration: no claim row written');
    const second = makeDeps(db);
    const r2 = await runCaptureFlow(second.deps);
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'migration_required');
    assert.equal(second.calls.captures, 0);
    assert.equal(second.calls.fulfills, 0);
  } finally {
    setCompletionColumnsOverride(null);
    setTransactionColumnOverride(null);
  }
});

test('two concurrent duplicates on claimed → exactly 1 capture total, 1 fulfillment', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', seedRow('claimed'));
  const a = makeDeps(db);
  const b = makeDeps(db);
  const [ra, rb] = await Promise.all([
    runCaptureFlow(a.deps),
    runCaptureFlow(b.deps),
  ]);
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, true);
  assert.equal(a.calls.captures + b.calls.captures, 1);
  assert.equal(a.calls.fulfills + b.calls.fulfills, 1);
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});

test('claim DB error → abort BEFORE capture (0 capture calls)', async () => {
  const db = makeDb({
    insertError: { code: 'XX000', message: 'connection reset' },
  });
  const { deps, calls } = makeDeps(db);
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'claim_failed');
  assert.equal(calls.captures, 0);
  assert.equal(calls.fulfills, 0);
});

test('amount mismatch → terminal failed (bulk-fix: never parked capturable)', async () => {
  const db = makeDb();
  const { deps, calls } = makeDeps(db, {
    captureResponse: { ...GOOD_CAPTURE, amountValue: '10.00' },
  });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'amount_mismatch');
  assert.equal(calls.captures, 1);
  assert.equal(calls.fulfills, 0);
  const row = db.rows.get('ORDER-1')!;
  assert.equal(row.status, 'failed');
  assert.equal(row.capture_id, 'CAP-1', 'capture id kept for operator refund');
  // Retry: failure page, never re-captured, never false success.
  const retry = makeDeps(db);
  const res2 = await runCaptureFlow(retry.deps);
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'already_failed');
  assert.equal(calls.captures + retry.calls.captures, 1);
});

test('recovery on a captured row with a mismatched amount → never fulfilled', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', seedRow('captured'));
  const { deps, calls } = makeDeps(db, {
    orderCapture: { ...GOOD_CAPTURE, amountValue: '99.99' },
  });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'amount_mismatch');
  assert.equal(calls.captures, 0);
  assert.equal(calls.fulfills, 0);
  assert.equal(db.rows.get('ORDER-1')!.status, 'captured');
});

test('capture not COMPLETED → fail, nothing fulfilled, lease released for retry', async () => {
  const db = makeDb();
  const { deps, calls } = makeDeps(db, {
    captureResponse: { ...GOOD_CAPTURE, status: 'DECLINED' },
  });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'capture_incomplete');
  assert.equal(calls.captures, 1);
  assert.equal(calls.fulfills, 0);
  assert.equal(db.rows.get('ORDER-1')!.status, 'claimed', 'lease released for retry');
});

// ---------------------------------------------------------------------------
// Peer 74760d84 regression test (Nov 2): F-CAP-01 residual TOCTOU.
// ---------------------------------------------------------------------------

test('race window: duplicate during winner capture → exactly 1 capture, loser resolves via winner', async () => {
  // F-CAP-01 residual regression (Nov 2, peer 74760d84): the insert
  // winner must win the claimed→capturing CAS BEFORE the PayPal capture
  // call. A duplicate arriving mid-capture must not issue a second
  // capture. (Adapted: this implementation takes the CAS before capture,
  // so the duplicate observes 'capturing' and polls — the pre-fix code
  // skipped the CAS, letting the duplicate see 'claimed' and capture.)
  const db = makeDb();
  const calls = { captures: 0, fulfills: 0 };
  let releaseR2!: () => void;
  const r2go = new Promise<void>((res) => { releaseR2 = res; });
  const slow = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // R1: the insert winner. Takes capturing, signals R2 once its capture
  // call is IN FLIGHT, then stays in flight 60ms.
  const r1 = makeDeps(db);
  const r1deps = {
    ...r1.deps,
    captureOrder: async (_orderId: string) => {
      calls.captures++;
      releaseR2();
      await slow(60);
      return { ...GOOD_CAPTURE };
    },
    fulfill: async () => { calls.fulfills++; },
    pollDelayMs: 10,
  };
  const r2 = makeDeps(db);
  const r2deps = {
    ...r2.deps,
    captureOrder: async (_orderId: string) => {
      calls.captures++;
      return { ...GOOD_CAPTURE };
    },
    fulfill: async () => { calls.fulfills++; },
    pollDelayMs: 10,
  };

  const p1 = runCaptureFlow(r1deps);
  await r2go; // R1's PayPal capture call is in flight NOW — the race window.
  // R2 must observe 'capturing' (R1 holds the CAS), not 'claimed'.
  assert.equal(db.rows.get('ORDER-1')?.status, 'capturing', 'winner holds capturing during capture');
  const p2 = runCaptureFlow(r2deps);
  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res1.ok, true, `R1: ${!res1.ok ? res1.reason : 'ok'}`);
  assert.equal(res2.ok, true, `R2 loser resolves via winner: ${!res2.ok ? res2.reason : 'ok'}`);
  assert.equal(calls.captures, 1, 'PayPal capture API must be called exactly once');
  assert.equal(calls.fulfills, 1, 'fulfillment must run exactly once');
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});

// ---------------------------------------------------------------------------
// Independent-review hardening tests (Nov 2, OpenAI defect-hunting review).
// ---------------------------------------------------------------------------

test('concurrent recovery race: two workers on captured → exactly 1 fulfill total', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', seedRow('captured'));
  const a = makeDeps(db, { orderCapture: { ...GOOD_CAPTURE } });
  const b = makeDeps(db, { orderCapture: { ...GOOD_CAPTURE } });
  const [ra, rb] = await Promise.all([
    runCaptureFlow(a.deps),
    runCaptureFlow(b.deps),
  ]);
  assert.equal(ra.ok, true, `A: ${!ra.ok ? ra.reason : 'ok'}`);
  assert.equal(rb.ok, true, `B: ${!rb.ok ? rb.reason : 'ok'}`);
  assert.equal(a.calls.captures + b.calls.captures, 0, 'recovery never re-captures');
  assert.equal(a.calls.fulfills + b.calls.fulfills, 1, 'exactly one fulfill across both workers');
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});

test('recovery with unreadable ledger guard → FAIL CLOSED, never double-fulfills', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', seedRow('captured'));
  // Simulate a previous run that fulfilled but crashed before marking,
  // with the ledger guard unreadable: the flow must NOT fulfill again.
  db.txRows.push({ id: 'tx-1', paypal_order_id: 'ORDER-1', status: 'succeeded' });
  const { deps, calls } = makeDeps(db, { orderCapture: { ...GOOD_CAPTURE } });
  // Force the guard to return null (column absent / read error).
  setTransactionColumnOverride(false);
  try {
    const res = await runCaptureFlow(deps);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'ledger_unreadable');
    assert.equal(calls.fulfills, 0, 'unreadable guard must not fulfill');
    assert.equal(calls.captures, 0);
  } finally {
    setTransactionColumnOverride(null);
  }
});

test('loser adopts a completed capture after owner crash (stuck capturing + PayPal COMPLETED)', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', {
    paypal_order_id: 'ORDER-1',
    kind: 'boost',
    provider_id: 'prov_1',
    status: 'capturing', // owner crashed between capture call and markCaptured
    capture_id: null,
    captured_at: null,
    fulfilled_at: null,
  });
  const { deps, calls } = makeDeps(db, {
    orderCapture: { ...GOOD_CAPTURE }, // fresh PayPal GET shows COMPLETED
  });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, true, `adopt+recover: ${!res.ok ? res.reason : 'ok'}`);
  assert.equal(calls.captures, 0, 'adopted capture is never re-captured');
  assert.equal(calls.fulfills, 1, 'recovery fulfills exactly once');
  const row = db.rows.get('ORDER-1')!;
  assert.equal(row.status, 'fulfilled');
  assert.equal(row.capture_id, 'CAP-1', 'adopted capture id persisted');
});

test('loser on stuck capturing WITHOUT a PayPal capture → FAIL, never false success', async () => {
  const db = makeDb();
  db.rows.set('ORDER-1', {
    paypal_order_id: 'ORDER-1',
    kind: 'boost',
    provider_id: 'prov_1',
    status: 'capturing',
    capture_id: null,
    captured_at: null,
    fulfilled_at: null,
  });
  // No orderCapture: PayPal shows no completed capture → no adoption.
  const { deps, calls } = makeDeps(db, { orderCapture: null });
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'race_unresolved_capturing');
  assert.equal(calls.captures, 0);
  assert.equal(calls.fulfills, 0);
});

test('markCaptured persist failure → capture_mark_failed, operator reconciles', async () => {
  const db = makeDb();
  const { deps, calls } = makeDeps(db);
  // Simulate the row vanishing between capture and markCaptured (the
  // CAS then matches zero rows → checked persist fails).
  const origCapture = deps.captureOrder;
  deps.captureOrder = async (id: string) => {
    const cap = await origCapture(id);
    db.rows.delete('ORDER-1');
    return cap;
  };
  const res = await runCaptureFlow(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'capture_mark_failed');
  assert.equal(calls.captures, 1, 'money moved at PayPal');
  assert.equal(calls.fulfills, 0, 'no fulfill on an unrecorded capture');
});

test('duplicate arriving while owner fulfills (recovering) → polls, resolves via owner', async () => {
  const db = makeDb();
  let releaseFulfill: () => void = () => {};
  const gate = new Promise<void>((r) => { releaseFulfill = r; });
  const mk = () => {
    const { deps, calls } = makeDeps(db);
    const orig = deps.fulfill;
    deps.fulfill = async (args: unknown) => {
      await gate;
      return orig(args);
    };
    return { deps, calls };
  };
  const a = mk();
  const b = mk();
  b.deps.pollDelayMs = 10;
  const pA = runCaptureFlow(a.deps); // owner: captures, takes recovering, enters gate
  await new Promise((r) => setTimeout(r, 25));
  const pB = runCaptureFlow(b.deps); // duplicate arrives while owner holds 'recovering'
  await new Promise((r) => setTimeout(r, 10)); // B is now polling on 'recovering'
  releaseFulfill(); // A completes fulfill -> fulfilled
  const [ra, rb] = await Promise.all([pA, pB]);
  assert.equal(ra.ok, true, `A: ${!ra.ok ? ra.reason : 'ok'}`);
  assert.equal(rb.ok, true, `B resolves via owner: ${!rb.ok ? rb.reason : 'ok'}`);
  assert.equal(a.calls.captures + b.calls.captures, 1);
  assert.equal(a.calls.fulfills + b.calls.fulfills, 1, 'exactly one fulfill: no owner/recovery double-fulfill');
  assert.equal(db.rows.get('ORDER-1')!.status, 'fulfilled');
});
