/**
 * Unit tests for lib/billing/capture-idempotency.ts (Nov 1, 2026 repair).
 * No test runner is installed in this app — run with Node's built-in
 * runner + type stripping (Node >= 22):
 *   node --experimental-strip-types --test tests/paypal-capture-idempotency.test.ts
 * The module under test is import-free by design so this works without
 * a bundler or path-alias resolution.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore - Node strip-types resolves the .ts extension at runtime.
import {
  decideCaptureClaim,
  UNIQUE_VIOLATION,
} from '../lib/billing/capture-idempotency.ts';

test('null/undefined error -> claimed (first sighting)', () => {
  assert.equal(decideCaptureClaim(null), 'claimed');
  assert.equal(decideCaptureClaim(undefined), 'claimed');
});

test('unique violation 23505 -> duplicate (prior run owns fulfillment)', () => {
  assert.equal(
    decideCaptureClaim({ code: '23505', message: 'duplicate key' }),
    'duplicate'
  );
  assert.equal(UNIQUE_VIOLATION, '23505');
});

test('non-unique DB error -> db_error (must abort before capture)', () => {
  assert.equal(
    decideCaptureClaim({ code: 'XX000', message: 'connection reset' }),
    'db_error'
  );
  assert.equal(
    decideCaptureClaim({ code: 'PGRST116', message: 'no rows' }),
    'db_error'
  );
  // An error object with no code is still a DB failure, never a duplicate.
  assert.equal(decideCaptureClaim({ message: 'timeout' }), 'db_error');
  assert.equal(decideCaptureClaim({}), 'db_error');
});

test('decision outcomes are exactly the three handled states', () => {
  const outcomes = new Set([
    decideCaptureClaim(null),
    decideCaptureClaim({ code: '23505' }),
    decideCaptureClaim({ code: 'XX000' }),
  ]);
  assert.deepEqual([...outcomes].sort(), ['claimed', 'db_error', 'duplicate']);
});
