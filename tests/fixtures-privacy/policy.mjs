/**
 * policy.mjs — ownership/privacy policy logic under test.
 *
 * These are faithful, dependency-free extractions of the behavior the G0
 * privacy patch (branch lizzie/g0-privacy-fix-2026-10-31) claims:
 *   - exact GPS stripped from every public listing surface
 *   - boost paths owner-gated with a 404 on provider mismatch
 *   - redeemPointsForBoost / activateBoost compare provider_id BEFORE any
 *     debit or write
 *
 * Each function takes the fixture db (same .from().select().eq() interface
 * the real server actions use) plus the caller's user id, and returns a
 * plain result object { ok, status, ... } instead of throwing.
 *
 * NOTE on fidelity: the real repo functions are Next.js server actions
 * (next/headers, i18n, real Supabase client) and cannot execute in plain
 * node. This module re-implements their decision logic step-for-step against
 * the fixture adapter. See the header comment in run-tests.mjs and the
 * readiness-route doc for what still needs the real Supabase env.
 */

export const BOOST_COST_POINTS = 900;
export const BOOST_DAYS = 7;

/** Resolve the caller's provider id (mirrors ownProviderId in the repo). */
export async function ownProviderId(db, userId) {
  const { data } = await db.from('providers').select('id').eq('user_id', userId).maybeSingle();
  return data ? data.id : null;
}

/**
 * Public-safe listing payload. Exact coordinates and the owner-linkage
 * (providers.user_id) are NEVER exposed on public surfaces — city/country
 * remain for search usefulness.
 */
export function toPublicListing(row) {
  const { latitude: _lat, longitude: _lng, providers: _prov, provider_id: _pid, ...rest } = row;
  return rest;
}

/**
 * Load a listing for a boost operation and owner-gate it.
 * 404 on missing OR on provider mismatch (no ownership oracle for attackers).
 */
export async function loadOwnedListing(db, userId, listingId) {
  const { data: listing } = await db
    .from('listings')
    .select('id, provider_id, providers!inner(user_id, completed_jobs, provider_tier)')
    .eq('id', listingId)
    .single();
  if (!listing) return { ok: false, status: 404, error: 'not_found' };
  const ownerUserId = listing.providers?.user_id ?? null;
  // THE ownership comparison: provider's user_id vs the caller, BEFORE anything else.
  if (ownerUserId !== userId) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, status: 200, listing };
}

function trustGate(listing) {
  const jobs = listing.providers?.completed_jobs ?? 0;
  return jobs >= 10 ? null : 'boost_not_eligible';
}

/**
 * Card path: $9 featured-boost Stripe checkout creation.
 * Mirrors app/api/stripe/checkout/route.ts (kind === 'boost').
 * On success records a session row instead of calling Stripe.
 */
export async function boostCheckout(db, userId, listingId) {
  const owned = await loadOwnedListing(db, userId, listingId);
  if (!owned.ok) return owned;
  const gate = trustGate(owned.listing);
  if (gate) return { ok: false, status: 403, error: gate };
  const providerId = await ownProviderId(db, userId);
  const session = {
    kind: 'boost', user_id: userId, provider_id: providerId, listing_id: listingId,
    status: 'created',
  };
  await db.from('checkout_sessions').insert(session);
  return { ok: true, status: 200, session };
}

/**
 * Points path: redeemPointsForBoost.
 * Mirrors lib/supabase/rewards-actions.ts: the ownership comparison happens
 * BEFORE the points debit (the debit runs through a service-role/admin path
 * that bypasses RLS, so app-level ordering is the only guard).
 */
export async function redeemPointsForBoost(db, userId, listingId, { adminDb = null } = {}) {
  const owned = await loadOwnedListing(db, userId, listingId);
  if (!owned.ok) return owned; // rejected BEFORE any debit
  const gate = trustGate(owned.listing);
  if (gate) return { ok: false, status: 403, error: gate };
  // Debit via the admin path (service role in prod — bypasses RLS).
  const ledger = (adminDb ?? db).from('points_ledger');
  await ledger.insert({ user_id: userId, delta: -BOOST_COST_POINTS, reason: 'redemption', reference_id: listingId });
  const until = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const providerId = await ownProviderId(db, userId);
  const { data: updated } = await db
    .from('listings')
    .update({ is_featured: true, featured_until: until })
    .eq('id', listingId)
    .eq('provider_id', providerId);
  if (!updated || updated.length === 0) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, status: 200 };
}

/**
 * activateBoost (lib/supabase/billing-actions.ts): owner-gated, tier-gated,
 * write scoped by id + provider_id.
 */
export async function activateBoost(db, userId, listingId) {
  const owned = await loadOwnedListing(db, userId, listingId);
  if (!owned.ok) return owned;
  if (owned.listing.providers?.provider_tier === 'community') {
    return { ok: false, status: 403, error: 'boost_locked' };
  }
  const until = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const providerId = await ownProviderId(db, userId);
  const { data: updated } = await db
    .from('listings')
    .update({ is_featured: true, featured_until: until })
    .eq('id', listingId)
    .eq('provider_id', providerId);
  if (!updated || updated.length === 0) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, status: 200 };
}

/** updateListing: write scoped to the caller's own provider_id (belt-and-suspenders over RLS). */
export async function updateListingOwned(db, userId, listingId, patch) {
  const providerId = await ownProviderId(db, userId);
  if (!providerId) return { ok: false, status: 403, error: 'not_a_provider' };
  const { data: updated } = await db
    .from('listings')
    .update(patch)
    .eq('id', listingId)
    .eq('provider_id', providerId);
  if (!updated || updated.length === 0) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, status: 200 };
}

/** deleteListing: scoped delete of the caller's own listing. */
export async function deleteListingOwned(db, userId, listingId) {
  const providerId = await ownProviderId(db, userId);
  if (!providerId) return { ok: false, status: 403, error: 'not_a_provider' };
  const before = db.__tables.listings.length;
  const remaining = db.__tables.listings.filter(
    (r) => !(r.id === listingId && r.provider_id === providerId)
  );
  if (remaining.length === before) return { ok: false, status: 404, error: 'not_found' };
  db.__tables.listings = remaining;
  return { ok: true, status: 200 };
}
