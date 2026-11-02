/**
 * Provider tiers — Verified + Community (two-tier launch, Oct 21, 2026).
 *
 * Spec: strategy/zervia-two-tier-launch-spec-2026-10-21.md (Liz approved
 * "launch both tiers — and a disclaimer?" Oct 21, 2026).
 *
 * VERIFIED — ID + licence checked where required (existing flows).
 *   Badge, higher ranking, Featured-eligible, any licensed category.
 * COMMUNITY — non-verified individuals (students, part-timers,
 *   FB/Kijiji sellers). Identity is NOT checked by Zervia. Light gate
 *   only: account + confirmed email (email-OTP flow) + a phone number
 *   on file + Provider Agreement attestation (timestamped on the
 *   provider row) + MANUAL admin approval. Max 2 active listings,
 *   Canada only at launch, low-risk categories only (allowlist below).
 *
 * This module is pure (no imports) so it can be unit-tested directly
 * and reused from API routes, server actions and server components.
 *
 * Degrade-safety: `provider_tier` arrives with migration 0052, which is
 * an OWNER step and may not be applied yet. Every read goes through
 * resolveProviderTier(), which never throws and never mislabels a
 * legacy provider as Community: pre-tier providers all completed the
 * mandatory ID onboarding, so a missing column resolves to 'verified'.
 */

export const PROVIDER_TIERS = ['verified', 'community'] as const;
export type ProviderTier = (typeof PROVIDER_TIERS)[number];

export function isProviderTier(value: unknown): value is ProviderTier {
  return value === 'verified' || value === 'community';
}

/** Minimal provider shape the tier logic reads. All fields optional. */
export interface TierProviderInput {
  provider_tier?: string | null;
}

/**
 * Resolve a provider row's tier. Explicit column wins; a missing
 * column (migration 0052 not applied) falls back to 'verified' —
 * every pre-tier provider passed mandatory ID onboarding, and the
 * dangerous error would be labelling a checked provider "not
 * verified", or a Community provider "verified". Community can only
 * ever come from the explicit column value.
 */
export function resolveProviderTier(
  provider: TierProviderInput | null | undefined
): ProviderTier {
  if (!provider) return 'verified';
  if (isProviderTier(provider.provider_tier)) return provider.provider_tier;
  return 'verified';
}

export function isCommunityProvider(
  provider: TierProviderInput | null | undefined
): boolean {
  return resolveProviderTier(provider) === 'community';
}

/** Full disclaimer (spec §3) — working draft, pending Goodlawyer review. */
export const COMMUNITY_DISCLAIMER_EN =
  'Zervia is a connector, not a service provider. Community Providers are independent individuals who have not been identity-checked, background-checked, or licensed-verified by Zervia. Zervia is not their employer or agent, is not a party to any agreement you make with them, and does not guarantee their identity, quality, availability, or safety. Any hiring, payment, and arrangement is directly between you and the provider, at your own risk. Before you hire: meet in a public place first, do not pay in full in advance, and get the job, price, and timing in writing.';

/** Safety checklist shown in the pre-contact modal (spec §3). */
export const COMMUNITY_SAFETY_CHECKLIST_EN = [
  'Meet in a public place first',
  'Do not pay in full in advance',
  'Get the job, price, and timing in writing',
  'Keep communication on Zervia where possible',
  'Report problems via the Report button',
] as const;

/**
 * Community category allowlist (spec §2 — low-risk only).
 * Derived from lib/categories.ts keys. Anything NOT listed here is
 * banned for Community by default (spec: "where ambiguous, default
 * BAN"). Subcategory-level rules live in COMMUNITY_SUBCATEGORY_RULES.
 */
export const COMMUNITY_ALLOWED_CATEGORIES: ReadonlySet<string> = new Set([
  'tutoring', // tutoring & lessons (incl. music, language, online)
  'errands', // errands & delivery help
  'cleaning', // cleaning help
  'yard', // yard / lawn help
  'moving', // moving help
  'handyman', // handyman HELPER only — see subcategory ban below
  'content_creator', // design / creative / online services
  'web_developer', // online services
  'app_developer', // online services
  'tech', // online / device help (no licensed-trade work exists here)
  'other', // event help + general labour subcategories only (rule below)
  'caregiving', // PET CARE ONLY — see subcategory rule below
]);

/**
 * Categories that are explicitly Verified-only (spec §2 BAN list).
 * Kept as a named set for tests/audits; enforcement is allowlist-based,
 * so this set is documentary + used by admin tooling. It includes the
 * licence-required categories from lib/categories.ts
 * (LICENSED_CATEGORIES) plus licensed trades and care categories.
 */
export const COMMUNITY_BANNED_CATEGORIES: ReadonlySet<string> = new Set([
  'legal_services',
  'insurance',
  'mortgage_brokerage',
  'electrical',
  'plumbing',
  'locksmith',
  'solar_install',
  'led_lighting',
  'home_renovation',
  'basement_renovation',
  'bathroom_renovation',
  'cabinetry',
  'drafting',
  'sealants',
  'window_glass_cleaning',
]);

/**
 * Subcategory rules for allowlisted categories that mix low-risk and
 * high-risk work:
 * - caregiving: ONLY pet_sitting (non-overnight at launch). Solo
 *   childcare, elder/personal care, special-needs and respite care are
 *   Verified-only.
 * - other: ONLY event_help + general_labor (custom_request is
 *   ambiguous → default BAN per spec).
 * A category absent from this map allows all of its subcategories.
 */
export const COMMUNITY_SUBCATEGORY_ALLOWLIST: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  caregiving: new Set(['pet_sitting']),
  other: new Set(['event_help', 'general_labor']),
};

export type CommunityCategoryVerdict =
  | { ok: true }
  | { ok: false; reason: 'category_banned' | 'subcategory_banned' };

/**
 * Server-side gate for Community listings (create + update + activate).
 * Enforced in the listings API and provider server actions — never
 * trust the UI to hide banned categories.
 */
export function checkCommunityCategory(
  category: string,
  subcategory?: string | null
): CommunityCategoryVerdict {
  if (!COMMUNITY_ALLOWED_CATEGORIES.has(category)) {
    return { ok: false, reason: 'category_banned' };
  }
  const subAllow = COMMUNITY_SUBCATEGORY_ALLOWLIST[category];
  if (subAllow && subcategory && !subAllow.has(subcategory)) {
    return { ok: false, reason: 'subcategory_banned' };
  }
  // caregiving/other REQUIRE an allowlisted subcategory (an empty
  // subcategory would smuggle the whole category through).
  if (subAllow && !subcategory) {
    return { ok: false, reason: 'subcategory_banned' };
  }
  return { ok: true };
}

/** Community launch limits (spec §1). */
export const COMMUNITY_MAX_ACTIVE_LISTINGS = 2;
export const COMMUNITY_LAUNCH_COUNTRY = 'CA';

export function checkCommunityListingBasics(input: {
  country: string;
  activeListingCountExcludingThis?: number;
  activating: boolean;
}): { ok: true } | { ok: false; reason: 'country' | 'listing_cap' } {
  if ((input.country || '').toUpperCase() !== COMMUNITY_LAUNCH_COUNTRY) {
    return { ok: false, reason: 'country' };
  }
  if (
    input.activating &&
    (input.activeListingCountExcludingThis ?? 0) >= COMMUNITY_MAX_ACTIVE_LISTINGS
  ) {
    return { ok: false, reason: 'listing_cap' };
  }
  return { ok: true };
}

/**
 * Light gate for Community onboarding (spec §1): confirmed email
 * (Supabase auth email_confirmed_at — the email-OTP flow confirms it),
 * a phone number on file, and a timestamped Provider Agreement
 * attestation. NO government ID is required for Community — and the
 * UI/copy must never imply one was checked.
 */
export function checkCommunityGate(input: {
  emailConfirmedAt?: string | null;
  phone?: string | null;
  agreementAccepted?: boolean;
}): { ok: true } | { ok: false; reason: 'email_unconfirmed' | 'phone_required' | 'agreement_required' } {
  if (!input.emailConfirmedAt) return { ok: false, reason: 'email_unconfirmed' };
  if (!input.phone || input.phone.replace(/[^0-9]/g, '').length < 7) {
    return { ok: false, reason: 'phone_required' };
  }
  if (!input.agreementAccepted) return { ok: false, reason: 'agreement_required' };
  return { ok: true };
}

/** Featured/boost eligibility: Community is NEVER Featured-eligible. */
export function isFeaturedEligible(
  provider: TierProviderInput | null | undefined
): boolean {
  return resolveProviderTier(provider) === 'verified';
}

/**
 * Tier rank for sorting: Verified (0) always above Community (1).
 * Use as the FIRST key in every discover/search sort so a Community
 * listing can never outrank a Verified one via rating/featured —
 * Community rows are also stripped of featured flags at write time.
 */
export function tierRank(provider: TierProviderInput | null | undefined): number {
  return resolveProviderTier(provider) === 'community' ? 1 : 0;
}

/** Moderation (spec §4): substantiated complaints before suspension. */
export const COMMUNITY_SUSPENSION_COMPLAINT_THRESHOLD = 2;

/**
 * GPS service-area verification (Karrot amendment §7a, Oct 21, 2026):
 * a Community provider verifies an area by being physically present —
 * the browser captures a device GPS fix and the server records it.
 * Max 2 areas. GPS presence verifies LOCATION only — it says nothing
 * about identity, and copy must never imply it does.
 */
export const COMMUNITY_MAX_SERVICE_AREAS = 2;

export function checkServiceAreaCount(existingCount: number): boolean {
  return (
    Number.isFinite(existingCount) &&
    existingCount >= 0 &&
    existingCount < COMMUNITY_MAX_SERVICE_AREAS
  );
}

/**
 * Community Trust Score (§7d — adapted from Karrot's Manner
 * Temperature). Plain 0–100 score. Inputs ONLY from Zervia records:
 * community feedback (which itself requires a Zervia contact request),
 * completed jobs recorded on Zervia, and substantiated offences in a
 * rolling 30-day window. Feedback influence is volume-capped so raw
 * volume cannot inflate the score.
 */
export interface CommunityTrustInputs {
  /** Average community-feedback rating 1–5, or null when none. */
  feedbackAvg: number | null;
  /** Number of community-feedback entries. */
  feedbackCount: number;
  /** Completed jobs recorded for this provider on Zervia. */
  completedJobs: number;
  /** Substantiated offences (actioned reports) in the last 30 days. */
  substantiatedOffences30d: number;
}

export const TRUST_FEEDBACK_VOLUME_CAP = 20;

export function computeCommunityTrustScore(input: CommunityTrustInputs): number {
  let score = 50;
  if (input.feedbackAvg != null && input.feedbackCount > 0) {
    const capped = Math.min(input.feedbackCount, TRUST_FEEDBACK_VOLUME_CAP);
    const volumeWeight = capped / TRUST_FEEDBACK_VOLUME_CAP; // 0..1
    // Rating 1..5 → -30..+30, scaled by capped volume.
    score += (input.feedbackAvg - 3) * 15 * volumeWeight;
  }
  // Jobs help, capped at +10 (10+ jobs).
  score += Math.min(Math.max(input.completedJobs, 0), 10);
  // Substantiated offences in the rolling 30-day window: −15 each.
  score -= Math.max(input.substantiatedOffences30d, 0) * 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}
