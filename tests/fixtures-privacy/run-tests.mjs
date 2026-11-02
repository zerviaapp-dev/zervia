/**
 * run-tests.mjs — credential-free privacy/ownership/customer-flow tests.
 *
 * Run: node tests/fixtures-privacy/run-tests.mjs
 * Exit 0 = all pass; exit 1 = any failure (CI-friendly).
 *
 * SCOPE. These tests validate the ownership/privacy POLICY the G0 patch
 * claims, against an in-memory fixture adapter that implements the same
 * .from().select().eq() data-access interface the real server actions use.
 * They do NOT touch Supabase, Stripe, or any credential — there is nothing
 * to configure. What they cannot cover (RLS policies, real PostgREST join
 * behavior, the service-role bypass, cookie auth) is listed in
 * evidence/TEST-ENV-READINESS-ROUTE-2026-10-31.md.
 *
 * FIXTURES. Alice (owner, 12 completed jobs) owns list-alice-1 with an exact
 * GPS pin (51.04473, -114.07191). Bob (attacker, 12 jobs) owns list-bob-1.
 * Carol (3 jobs) owns list-carol-1 for the trust-gate test. Everyone starts
 * with 1500 points.
 */
import { createFixtureDb, seedFixtures, pointsBalance } from './fixture-db.mjs';
import {
  ownProviderId, toPublicListing, loadOwnedListing,
  boostCheckout, redeemPointsForBoost, activateBoost,
  updateListingOwned, deleteListingOwned, BOOST_COST_POINTS,
} from './policy.mjs';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  PASS  ${name}`); })
    .catch((e) => { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e.message}`); });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function fresh() { const opLog = []; const db = createFixtureDb(seedFixtures(), { opLog }); return { db, opLog }; }
async function as(db, userId) { /* caller identity is passed explicitly to policy fns */ return userId; }

// ── A. Public payloads never contain exact coordinates ──────────────────────
await test('A1 public payload strips latitude', async () => {
  const { db } = fresh();
  const { data } = await db.from('listings').select('*').eq('id', 'list-alice-1').single();
  const pub = toPublicListing(data);
  assert(!('latitude' in pub), 'latitude leaked into public payload');
});
await test('A2 public payload strips longitude', async () => {
  const { db } = fresh();
  const { data } = await db.from('listings').select('*').eq('id', 'list-alice-1').single();
  assert(!('longitude' in toPublicListing(data)), 'longitude leaked into public payload');
});
await test('A3 public payload strips owner linkage (providers.user_id)', async () => {
  const { db } = fresh();
  const { data } = await db.from('listings')
    .select('id, title, city, country, providers!inner(user_id)').eq('id', 'list-alice-1').single();
  const pub = toPublicListing(data);
  assert(!('providers' in pub) && !('provider_id' in pub), 'owner linkage leaked');
});
await test('A4 public payload keeps search-useful fields (title/city/country)', async () => {
  const { db } = fresh();
  const { data } = await db.from('listings').select('*').eq('id', 'list-alice-1').single();
  const pub = toPublicListing(data);
  assert(pub.title === 'Emergency plumbing' && pub.city === 'Calgary' && pub.country === 'Canada',
    'public payload lost useful fields');
});
await test('A5 fixture row really holds exact coords (strip is not vacuous)', async () => {
  const { db } = fresh();
  const { data } = await db.from('listings').select('*').eq('id', 'list-alice-1').single();
  assert(data.latitude === 51.04473 && data.longitude === -114.07191, 'fixture has no exact coords to strip');
});
await test('A6 owner dashboard view retains the pin (private, owner-only)', async () => {
  const { db } = fresh();
  const pid = await ownProviderId(db, 'user-alice');
  const { data } = await db.from('listings').select('*').eq('id', 'list-alice-1').eq('provider_id', pid).single();
  assert(data.latitude === 51.04473, 'owner should still see their own pin');
});

// ── B. Boost checkout (card path): Bob cannot buy boost on Alice's listing ──
await test('B1 Bob boost-checkout on Alice listing → 404, no session created', async () => {
  const { db } = fresh();
  const r = await boostCheckout(db, 'user-bob', 'list-alice-1');
  assert(r.status === 404 && !r.ok, `expected 404, got ${r.status}`);
  assert(db.__tables.checkout_sessions.length === 0, 'a checkout session was created for the attacker');
});
await test('B2 Alice boost-checkout on own listing → allowed, session pinned to owner', async () => {
  const { db } = fresh();
  const r = await boostCheckout(db, 'user-alice', 'list-alice-1');
  assert(r.ok && r.status === 200, `expected 200, got ${r.status}`);
  const s = db.__tables.checkout_sessions[0];
  assert(s.user_id === 'user-alice' && s.provider_id === 'prov-alice' && s.listing_id === 'list-alice-1',
    'session metadata not pinned to owner');
});
await test('B3 boost-checkout on missing listing → 404', async () => {
  const { db } = fresh();
  const r = await boostCheckout(db, 'user-alice', 'list-nope');
  assert(r.status === 404, `expected 404, got ${r.status}`);
});

// ── C. redeemPointsForBoost: ownership BEFORE debit ─────────────────────────
await test('C1 Bob redeem on Alice listing → rejected, balances untouched, not featured', async () => {
  const { db, opLog } = fresh();
  const before = pointsBalance(db, 'user-bob');
  const r = await redeemPointsForBoost(db, 'user-bob', 'list-alice-1');
  assert(r.status === 404 && !r.ok, `expected 404, got ${r.status}`);
  assert(pointsBalance(db, 'user-bob') === before, 'attacker points were debited');
  assert(pointsBalance(db, 'user-alice') === 1500, 'victim points changed');
  const { data } = await db.from('listings').select('is_featured').eq('id', 'list-alice-1').single();
  assert(data.is_featured === false, 'attacker boosted the victim listing');
  const ledgerWrites = opLog.filter((o) => o.op === 'insert' && o.table === 'points_ledger');
  const listingWrites = opLog.filter((o) => o.op === 'update' && o.table === 'listings');
  assert(ledgerWrites.length === 0 && listingWrites.length === 0,
    'a debit or write happened despite the ownership rejection');
});
await test('C2 op order: ownership compare precedes any debit (rejection path)', async () => {
  const { db, opLog } = fresh();
  await redeemPointsForBoost(db, 'user-bob', 'list-alice-1');
  const firstLedger = opLog.findIndex((o) => o.table === 'points_ledger' && o.op === 'insert');
  assert(firstLedger === -1, 'ledger was written on the attacker path');
  assert(opLog[0]?.op === 'select' && opLog[0]?.table === 'listings', 'first op is not the ownership read');
});
await test('C3 Alice redeem on own listing → 900 debited, featured, ledger row labelled', async () => {
  const { db } = fresh();
  const r = await redeemPointsForBoost(db, 'user-alice', 'list-alice-1');
  assert(r.ok, `expected ok, got ${r.status}/${r.error}`);
  assert(pointsBalance(db, 'user-alice') === 1500 - BOOST_COST_POINTS, 'debit amount wrong');
  const row = db.__tables.points_ledger.find((x) => x.reason === 'redemption');
  assert(row && row.user_id === 'user-alice' && row.reference_id === 'list-alice-1', 'ledger row mislabelled');
  const { data } = await db.from('listings').select('is_featured').eq('id', 'list-alice-1').single();
  assert(data.is_featured === true, 'listing not boosted');
});
await test('C4 Carol (3 jobs) redeem on own listing → trust gate rejects, no debit', async () => {
  const { db } = fresh();
  const r = await redeemPointsForBoost(db, 'user-carol', 'list-carol-1');
  assert(r.status === 403 && r.error === 'boost_not_eligible', `expected trust-gate 403, got ${r.status}`);
  assert(pointsBalance(db, 'user-carol') === 1500, 'points debited despite trust gate');
});

// ── D. activateBoost: owner-gated ───────────────────────────────────────────
await test('D1 Bob activateBoost on Alice listing → rejected, not featured', async () => {
  const { db } = fresh();
  const r = await activateBoost(db, 'user-bob', 'list-alice-1');
  assert(!r.ok && r.status === 404, `expected 404, got ${r.status}`);
  const { data } = await db.from('listings').select('is_featured').eq('id', 'list-alice-1').single();
  assert(data.is_featured === false, 'attacker activated boost on victim listing');
});
await test('D2 Alice activateBoost on own listing → featured', async () => {
  const { db } = fresh();
  const r = await activateBoost(db, 'user-alice', 'list-alice-1');
  assert(r.ok, `expected ok, got ${r.status}/${r.error}`);
  const { data } = await db.from('listings').select('is_featured').eq('id', 'list-alice-1').single();
  assert(data.is_featured === true, 'owner boost did not activate');
});

// ── E. Cross-account writes rejected ───────────────────────────────────────
await test('E1 Bob updateListing on Alice listing → 404, title unchanged', async () => {
  const { db } = fresh();
  const r = await updateListingOwned(db, 'user-bob', 'list-alice-1', { title: 'HACKED' });
  assert(r.status === 404 && !r.ok, `expected 404, got ${r.status}`);
  const { data } = await db.from('listings').select('title').eq('id', 'list-alice-1').single();
  assert(data.title === 'Emergency plumbing', 'victim listing was modified');
});
await test('E2 Alice updateListing on own listing → ok', async () => {
  const { db } = fresh();
  const r = await updateListingOwned(db, 'user-alice', 'list-alice-1', { title: 'Emergency plumbing 24/7' });
  assert(r.ok, `expected ok, got ${r.status}`);
});
await test('E3 Bob deleteListing on Alice listing → rejected, row survives', async () => {
  const { db } = fresh();
  const r = await deleteListingOwned(db, 'user-bob', 'list-alice-1');
  assert(!r.ok && r.status === 404, `expected 404, got ${r.status}`);
  const { data } = await db.from('listings').select('id').eq('id', 'list-alice-1').maybeSingle();
  assert(data !== null, 'victim listing was deleted');
});
await test('E4 Alice deleteListing on own listing → ok', async () => {
  const { db } = fresh();
  const r = await deleteListingOwned(db, 'user-alice', 'list-alice-1');
  assert(r.ok, `expected ok, got ${r.status}`);
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed) { console.log('Failures:', failures.join('; ')); process.exit(1); }
