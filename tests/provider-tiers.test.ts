/**
 * Unit tests for lib/provider-tiers.ts (two-tier launch, Oct 21, 2026).
 * No test runner is installed in this app — run with Node's built-in
 * runner + type stripping (Node >= 22):
 *   node --experimental-strip-types --test tests/provider-tiers.test.ts
 * The module under test is import-free by design so this works without
 * a bundler or path-alias resolution.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore - Node strip-types resolves the .ts extension at runtime.
import {
  resolveProviderTier,
  isCommunityProvider,
  checkCommunityCategory,
  checkCommunityListingBasics,
  checkCommunityGate,
  isFeaturedEligible,
  tierRank,
  COMMUNITY_BANNED_CATEGORIES,
  COMMUNITY_ALLOWED_CATEGORIES,
} from '../lib/provider-tiers.ts';

test('tier resolution: explicit column wins', () => {
  assert.equal(resolveProviderTier({ provider_tier: 'community' }), 'community');
  assert.equal(resolveProviderTier({ provider_tier: 'verified' }), 'verified');
  assert.equal(isCommunityProvider({ provider_tier: 'community' }), true);
});

test('tier resolution: missing column degrades to verified, never community', () => {
  assert.equal(resolveProviderTier({}), 'verified');
  assert.equal(resolveProviderTier({ provider_tier: null }), 'verified');
  assert.equal(resolveProviderTier({ provider_tier: 'bogus' }), 'verified');
  assert.equal(resolveProviderTier(null), 'verified');
  assert.equal(resolveProviderTier(undefined), 'verified');
});

test('community allowlist: low-risk categories pass', () => {
  for (const c of ['tutoring', 'errands', 'cleaning', 'yard', 'moving', 'handyman', 'content_creator', 'web_developer', 'app_developer', 'tech']) {
    assert.deepEqual(checkCommunityCategory(c, 'x'), { ok: true }, c);
  }
});

test('community banlist: every spec-banned category rejected server-side', () => {
  const banned = [
    'legal_services', 'insurance', 'mortgage_brokerage', // licence-required
    'electrical', 'plumbing', // licensed trades (spec)
    'locksmith', 'solar_install', 'home_renovation', 'basement_renovation',
    'bathroom_renovation', 'cabinetry', 'drafting', 'sealants',
    'beauty', 'massage', 'fitness', 'cooking', 'buy_sell', 'room_rentals',
    'house_rent', 'basement_suite', 'apartment_condo', 'flower_shop',
    'window_glass_cleaning', 'led_lighting', 'not_a_category',
  ];
  for (const c of banned) {
    const v = checkCommunityCategory(c);
    assert.equal(v.ok, false, c);
  }
  // The named ban set and the allowlist must never overlap.
  for (const c of COMMUNITY_BANNED_CATEGORIES) {
    assert.equal(COMMUNITY_ALLOWED_CATEGORIES.has(c), false, c);
  }
});

test('community subcategory rules: caregiving is pet-care only', () => {
  assert.deepEqual(checkCommunityCategory('caregiving', 'pet_sitting'), { ok: true });
  for (const s of ['childcare', 'elder_care', 'special_needs_care', 'respite_care', 'companionship']) {
    assert.equal(checkCommunityCategory('caregiving', s).ok, false, s);
  }
  // No subcategory = smuggling the whole category: banned.
  assert.equal(checkCommunityCategory('caregiving').ok, false);
  assert.equal(checkCommunityCategory('caregiving', null).ok, false);
});

test('community subcategory rules: other is event/general labour only', () => {
  assert.deepEqual(checkCommunityCategory('other', 'event_help'), { ok: true });
  assert.deepEqual(checkCommunityCategory('other', 'general_labor'), { ok: true });
  assert.equal(checkCommunityCategory('other', 'custom_request').ok, false);
  assert.equal(checkCommunityCategory('other').ok, false);
});

test('community listing basics: Canada-only + max 2 active', () => {
  assert.deepEqual(
    checkCommunityListingBasics({ country: 'CA', activating: true, activeListingCountExcludingThis: 1 }),
    { ok: true }
  );
  assert.equal(checkCommunityListingBasics({ country: 'US', activating: false }).ok, false);
  assert.equal(
    checkCommunityListingBasics({ country: 'CA', activating: true, activeListingCountExcludingThis: 2 }).ok,
    false
  );
  // Drafts are not capped (only ACTIVE listings count).
  assert.deepEqual(
    checkCommunityListingBasics({ country: 'CA', activating: false, activeListingCountExcludingThis: 5 }),
    { ok: true }
  );
});

test('community gate: email OTP confirmation + phone + attestation', () => {
  assert.deepEqual(
    checkCommunityGate({ emailConfirmedAt: '2026-10-21T00:00:00Z', phone: '+1 403 555 0100', agreementAccepted: true }),
    { ok: true }
  );
  assert.equal(checkCommunityGate({ emailConfirmedAt: null, phone: '4035550100', agreementAccepted: true }).ok, false);
  assert.equal(checkCommunityGate({ emailConfirmedAt: 'x', phone: '', agreementAccepted: true }).ok, false);
  assert.equal(checkCommunityGate({ emailConfirmedAt: 'x', phone: '4035550100', agreementAccepted: false }).ok, false);
});

test('featured eligibility + ranking: verified above community', () => {
  assert.equal(isFeaturedEligible({ provider_tier: 'verified' }), true);
  assert.equal(isFeaturedEligible({ provider_tier: 'community' }), false);
  assert.ok(tierRank({ provider_tier: 'verified' }) < tierRank({ provider_tier: 'community' }));
});

test('GPS service areas: max 2', async () => {
  const m = await import('../lib/provider-tiers.ts');
  assert.equal(m.checkServiceAreaCount(0), true);
  assert.equal(m.checkServiceAreaCount(1), true);
  assert.equal(m.checkServiceAreaCount(2), false);
  assert.equal(m.COMMUNITY_MAX_SERVICE_AREAS, 2);
});

test('community trust score: capped volume, 30-day offences, plain bounds', async () => {
  const m = await import('../lib/provider-tiers.ts');
  // New provider, no signals: neutral 50.
  assert.equal(m.computeCommunityTrustScore({ feedbackAvg: null, feedbackCount: 0, completedJobs: 0, substantiatedOffences30d: 0 }), 50);
  // Perfect feedback at cap + 10 jobs: 50 + 30 + 10 = 90.
  assert.equal(m.computeCommunityTrustScore({ feedbackAvg: 5, feedbackCount: 20, completedJobs: 10, substantiatedOffences30d: 0 }), 90);
  // Volume beyond the cap cannot inflate further.
  assert.equal(m.computeCommunityTrustScore({ feedbackAvg: 5, feedbackCount: 500, completedJobs: 10, substantiatedOffences30d: 0 }), 90);
  // One substantiated offence in window: -15.
  assert.equal(m.computeCommunityTrustScore({ feedbackAvg: null, feedbackCount: 0, completedJobs: 0, substantiatedOffences30d: 1 }), 35);
  // Floor at 0.
  assert.equal(m.computeCommunityTrustScore({ feedbackAvg: 1, feedbackCount: 20, completedJobs: 0, substantiatedOffences30d: 3 }), 0);
});
