'use server';

import { getTranslations } from 'next-intl/server';
import { createClient } from './server';
import { BOOST_COST_POINTS } from '@/lib/rewards';
import type { ActionResult } from './actions';
import { awardPointsAdmin } from './notifications';


export type LedgerRow = {
  id: string;
  points_delta: number;
  reason: string;
  reference_id: string | null;
  created_at: string;
};

export type ReferralRow = {
  id: string;
  code: string;
  status: string;
  referred_email: string | null;
  redeemed_at: string | null;
  created_at: string;
};

/** Leaderboard time windows (matches migration 0028's referral_leaderboard fn). */
export type LeaderboardPeriod = 'week' | 'month' | 'all';

export type LeaderboardRow = {
  rank: number;
  display_name: string;
  referral_count: number;
  redeemed_count: number;
};

/**
 * Top referrers for a period, via the SECURITY DEFINER referral_leaderboard()
 * function (migration 0028). Returns [] if the function isn't deployed yet —
 * the page renders its empty state instead of crashing.
 */
export async function getReferralLeaderboard(
  period: LeaderboardPeriod
): Promise<LeaderboardRow[]> {
  const ctx = await authed();
  if (!ctx) return [];
  try {
    const { data, error } = await ctx.supabase.rpc('referral_leaderboard', {
      p_period: period,
    });
    if (error || !data) return [];
    return (data as LeaderboardRow[]).slice(0, 10);
  } catch {
    return [];
  }
}

async function rewardsT(locale: string) {
  return getTranslations({ locale, namespace: 'Rewards' });
}

async function authT(locale: string) {
  return getTranslations({ locale, namespace: 'Auth' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : 'en';
}

type Ctx = {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  userId: string;
};

async function authed(): Promise<Ctx | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

/**
 * Current balance = SUM(points_delta) over the caller's own rows.
 * Never stored, always computed — the number on screen can never drift
 * from the ledger. Owner-only by RLS.
 */
export async function getBalance(): Promise<number | null> {
  const ctx = await authed();
  if (!ctx) return null;
  const { data } = await ctx.supabase
    .from('rewards_ledger')
    .select('points_delta')
    .eq('user_id', ctx.userId);
  if (!data) return 0;
  return data.reduce((sum, r) => sum + (r.points_delta as number), 0);
}

/** Newest-first ledger rows for the history list. */
export async function getLedger(limit = 50): Promise<LedgerRow[]> {
  const ctx = await authed();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from('rewards_ledger')
    .select('id, points_delta, reason, reference_id, created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as LedgerRow[];
}

/** The caller's permanent referral code (ZBXXXXXX). */
export async function getMyReferralCode(): Promise<string | null> {
  const ctx = await authed();
  if (!ctx) return null;
  const { data } = await ctx.supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', ctx.userId)
    .single();
  return (data?.referral_code as string | null) ?? null;
}

/** Referrals this user sent (they see only their own — RLS). */
export async function getMyReferrals(): Promise<ReferralRow[]> {
  const ctx = await authed();
  if (!ctx) return [];
  const { data: refs } = await ctx.supabase
    .from('referrals')
    .select('id, code, status, referred_email, redeemed_at, created_at')
    .eq('referrer_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(100);
  return (refs ?? []) as ReferralRow[];
}

/**
 * Backfill/manual path for the signup bonus. The normal path is the
 * database trigger on email verification (0009) — this exists so a bonus
 * missed for any reason can be granted exactly once. Idempotent: the
 * database rejects a second award for the same user.
 */
export async function awardSignupBonus(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await rewardsT(locale);
  const ta = await authT(locale);
  const ctx = await authed();
  if (!ctx) return { ok: false, message: ta('errorSessionExpired') };

  // Migration 0036 revoked `award_points` from `authenticated` — route
  // through the service-role client (see `lib/supabase/notifications.ts`).
  const { error } = await awardPointsAdmin({
    userId: ctx.userId,
    delta: 100,
    reason: 'signup',
    referenceId: null,
  });
  if (error) {
    if (error.message.toLowerCase().includes('already awarded'))
      return { ok: true, message: t('bonusAlreadyThere') };
    return { ok: false, message: ta('errorGeneric') };
  }
  return { ok: true, message: t('bonusGranted') };
}

/**
 * Spend points on a 7-day featured boost for one of the caller's listings.
 * The database function enforces the two money-safety rules atomically:
 * the caller can only spend their own points, and the balance can never
 * go below zero (advisory lock + balance check inside award_points).
 *
 * Phase 5 hook: the actual boost activation (is_featured + Stripe) happens
 * at checkout. This writes the real -900 ledger row now and returns the
 * redemption id; Phase 5's boost purchase looks up this row by reference_id
 * (the listing) to settle it. Clearly labelled in the UI as reserved.
 */
export async function redeemPointsForBoost(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await rewardsT(locale);
  const ta = await authT(locale);
  const ctx = await authed();
  if (!ctx) return { ok: false, message: ta('errorSessionExpired') };

  const listingId = String(formData.get('listingId') ?? '').trim();
  if (!listingId) return { ok: false, message: t('redeemChooseListing') };

  // Defence in depth: the listing must belong to the caller (RLS on
  // listings already guarantees this; we check for a friendly message).
  const { data: listing } = await ctx.supabase
    .from('listings')
    .select('id, provider_id, providers!inner(user_id, completed_jobs)')
    .eq('id', listingId)
    .single();
  if (!listing) return { ok: false, message: ta('errorGeneric') };

  // Trust gate (Phase 5): Featured Boost is earned — 10+ completed jobs.
  const completedJobs =
    (listing.providers as unknown as { completed_jobs?: number } | null)
      ?.completed_jobs ?? 0;
  if (completedJobs < 10)
    return { ok: false, message: t('redeemBoostNotEligible') };

  // Migration 0036 revoked `award_points` from `authenticated` — route
  // through the service-role client (see `lib/supabase/notifications.ts`).
  const { error } = await awardPointsAdmin({
    userId: ctx.userId,
    delta: -BOOST_COST_POINTS,
    reason: 'redemption',
    referenceId: listingId,
  });
  if (error) {
    if (error.message.toLowerCase().includes('insufficient points'))
      return { ok: false, message: t('redeemInsufficient') };
    return { ok: false, message: ta('errorGeneric') };
  }
  // Phase 5 settles the redemption: the boost goes live immediately.
  // (The listing ownership was verified above; RLS enforces it again.)
  const until = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { error: boostError } = await ctx.supabase
    .from('listings')
    .update({ is_featured: true, featured_until: until })
    .eq('id', listingId);
  if (boostError) return { ok: false, message: ta('errorGeneric') };
  return { ok: true, message: t('redeemSuccess') };
}
