/**
 * Tests for the Nov 1, 2026 repair of lib/billing-fulfillment.ts
 * `recordPayPalTransaction`: the transaction insert failure is LOUD
 * (throws) instead of console.error-and-continue (the P1-2 anti-pattern).
 *
 * Portability (Nov 2, 2026 bulk-fix): the test imports the TypeScript
 * SOURCE directly via the repo-relative alias resolver
 * (tests/hooks/register-alias.mjs) — no tsc compile step, no absolute
 * /tmp paths, runs on any checkout. `@supabase/supabase-js` is stubbed
 * by the resolver; the stub never runs because a fake admin is injected.
 *
 * Run: npm run test:paypal
 *   (node --experimental-strip-types --import ./tests/hooks/register-alias.mjs
 *    --test tests/paypal-loud-ledger.test.mjs)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordPayPalTransaction } from '../lib/billing-fulfillment.ts';

/** Minimal supabase-js-shaped fake: only the surface recordPayPalTransaction uses. */
function makeFakeAdmin({ insertError = null, columnsAvailable = true } = {}) {
  const calls = { inserts: [] };
  const chainable = {
    limit() { return Promise.resolve({ data: [], error: columnsAvailable ? null : { message: 'column missing' } }); },
  };
  return {
    calls,
    from(table) {
      assert.equal(table, 'transactions');
      return {
        select() { return chainable; },
        insert(row) {
          calls.inserts.push(row);
          return Promise.resolve({ data: null, error: insertError });
        },
      };
    },
  };
}

const baseRow = {
  user_id: 'user_1',
  provider_id: 'prov_1',
  paypal_order_id: 'ORDER-123',
  paypal_capture_id: 'CAP-456',
  amount_cents: 900,
  currency: 'cad',
  type: 'boost',
  status: 'succeeded',
  description: 'Featured boost (7 days) — via PayPal',
};

test('successful insert resolves without throwing', async () => {
  const admin = makeFakeAdmin();
  await recordPayPalTransaction(admin, baseRow);
  assert.equal(admin.calls.inserts.length, 1);
  assert.equal(admin.calls.inserts[0].paypal_order_id, 'ORDER-123');
});

test('failed insert THROWS (loud) and names the order id', async () => {
  const admin = makeFakeAdmin({ insertError: { message: 'connection reset', code: 'XX000' } });
  await assert.rejects(
    () => recordPayPalTransaction(admin, baseRow),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /ORDER-123/);
      assert.match(err.message, /transaction insert failed/);
      return true;
    }
  );
});

test('failed insert without an order id still throws (names unknown)', async () => {
  const admin = makeFakeAdmin({ insertError: { message: 'db down' } });
  const { paypal_order_id, ...row } = baseRow;
  await assert.rejects(() => recordPayPalTransaction(admin, row), /unknown/);
});

test('columns-unavailable fallback path also throws loudly on failure', async () => {
  const admin = makeFakeAdmin({ insertError: { message: 'db down' }, columnsAvailable: false });
  await assert.rejects(() => recordPayPalTransaction(admin, baseRow), /transaction insert failed/);
});
