/**
 * Random provider quality-audit engine (pure logic, no DB).
 *
 * DB I/O lives in `lib/supabase/audit-actions.ts`; this module holds the
 * scoring rules and the weighted random selection so the rules can be
 * unit-tested without Supabase.
 *
 * ## Scoring (0–100)
 * Six checks, weighted:
 * - Profile completeness .......... 15
 * - Response time ................. 15
 * - Review score .................. 25
 * - Booking completion rate ....... 20
 * - ID verification status ........ 15
 * - Complaints .................... 10
 *
 * Suggested verdict: score ≥ 80 → pass · 50–79 → warning · < 50 → suspend.
 * A human (CEO/admin) always confirms or overrides the suggestion.
 *
 * ## Weighted random selection
 * New providers (≤ 30 days) and low-rated providers get a higher chance
 * of being picked, so audits concentrate where risk is highest — but
 * every active provider can still be selected.
 *
 * ## Weekly automation (cron suggestion)
 * Recommended: a platform cron (e.g. Vercel Cron, pg_cron, or the
 * existing job runner) calls `runWeeklyAuditBatch()` from
 * `lib/supabase/audit-actions.ts` every Monday ~06:00 UTC:
 *
 *   - audits 10 weighted-random active providers (run_source = 'weekly_cron')
 *   - emails a summary table to the CEO (zerviaapp@gmail.com)
 *   - warnings/suspensions still need a human to confirm on
 *     /app/admin/audits — the cron never suspends anyone by itself.
 */

export interface AuditCheckInput {
  /** business_name, description, category, city, phone/whatsapp present */
  profileFields: {
    hasBusinessName: boolean;
    bioLength: number;
    hasCategory: boolean;
    hasContact: boolean;
    activeListingCount: number;
  };
  /** average provider reply time in hours; null = no message data */
  avgResponseHours: number | null;
  /** provider's stored aggregates */
  ratingAvg: number;
  reviewCount: number;
  /** booking counts by status */
  bookings: { completed: number; cancelled: number; disputed: number; total: number };
  /** 'not_submitted' | 'pending' | 'approved' | 'rejected' */
  idVerificationStatus: string;
  /** open + actioned reports against the provider (last 180 days) */
  complaintCount: number;
}

export interface AuditCheckResult {
  /** 0–100 for this check */
  score: number;
  detail: string;
}

export interface AuditBreakdown {
  profile: AuditCheckResult;
  responseTime: AuditCheckResult;
  reviews: AuditCheckResult;
  completion: AuditCheckResult;
  verification: AuditCheckResult;
  complaints: AuditCheckResult;
}

export interface AuditScore {
  total: number;
  breakdown: AuditBreakdown;
  issues: string[];
  suggested: 'pass' | 'warning' | 'suspend';
}

export const AUDIT_WEIGHTS = {
  profile: 15,
  responseTime: 15,
  reviews: 25,
  completion: 20,
  verification: 15,
  complaints: 10,
} as const;

function checkProfile(f: AuditCheckInput['profileFields']): AuditCheckResult {
  let score = 0;
  const missing: string[] = [];
  if (f.hasBusinessName) score += 25;
  else missing.push('business name');
  if (f.bioLength >= 30) score += 25;
  else missing.push('bio (min 30 chars)');
  if (f.hasCategory) score += 15;
  else missing.push('category');
  if (f.hasContact) score += 15;
  else missing.push('phone/WhatsApp');
  if (f.activeListingCount > 0) score += 20;
  else missing.push('at least one active listing');
  return {
    score,
    detail:
      missing.length === 0
        ? 'Profile complete'
        : `Missing: ${missing.join(', ')}`,
  };
}

function checkResponseTime(avgHours: number | null): AuditCheckResult {
  if (avgHours === null) {
    return { score: 60, detail: 'No message history yet' };
  }
  if (avgHours <= 2) return { score: 100, detail: `Replies in ~${avgHours.toFixed(1)}h` };
  if (avgHours <= 12) return { score: 80, detail: `Replies in ~${avgHours.toFixed(1)}h` };
  if (avgHours <= 24) return { score: 60, detail: `Replies in ~${avgHours.toFixed(1)}h` };
  if (avgHours <= 72) return { score: 30, detail: `Slow replies (~${avgHours.toFixed(0)}h avg)` };
  return { score: 0, detail: `Very slow replies (~${avgHours.toFixed(0)}h avg)` };
}

function checkReviews(ratingAvg: number, reviewCount: number): AuditCheckResult {
  if (reviewCount === 0) {
    return { score: 55, detail: 'No reviews yet' };
  }
  // Rating drives the score; a handful of reviews caps the upside.
  const ratingScore = Math.max(0, Math.min(100, ((ratingAvg - 1) / 4) * 100));
  const volumeBonus = Math.min(15, reviewCount); // up to +15 for 15+ reviews
  const score = Math.round(Math.min(100, ratingScore * 0.85 + volumeBonus));
  return {
    score,
    detail: `${ratingAvg.toFixed(1)}★ across ${reviewCount} review${reviewCount === 1 ? '' : 's'}`,
  };
}

function checkCompletion(b: AuditCheckInput['bookings']): AuditCheckResult {
  const finished = b.completed + b.cancelled;
  if (b.total === 0 || finished === 0) {
    return { score: 55, detail: 'No completed bookings yet' };
  }
  const rate = b.completed / finished;
  const disputePenalty = Math.min(30, b.disputed * 10);
  const score = Math.max(0, Math.round(rate * 100 - disputePenalty));
  return {
    score,
    detail: `${b.completed}/${finished} bookings completed${b.disputed > 0 ? `, ${b.disputed} disputed` : ''}`,
  };
}

function checkVerification(status: string): AuditCheckResult {
  switch (status) {
    case 'approved':
      return { score: 100, detail: 'ID verified' };
    case 'pending':
      return { score: 60, detail: 'ID verification pending' };
    case 'rejected':
      return { score: 20, detail: 'ID verification rejected — resubmit' };
    default:
      return { score: 30, detail: 'ID not submitted' };
  }
}

function checkComplaints(count: number): AuditCheckResult {
  if (count === 0) return { score: 100, detail: 'No complaints' };
  if (count === 1) return { score: 70, detail: '1 complaint on record' };
  if (count <= 3) return { score: 40, detail: `${count} complaints on record` };
  return { score: 0, detail: `${count} complaints on record` };
}

/** Score a provider from gathered check inputs. */
export function scoreProvider(input: AuditCheckInput): AuditScore {
  const breakdown: AuditBreakdown = {
    profile: checkProfile(input.profileFields),
    responseTime: checkResponseTime(input.avgResponseHours),
    reviews: checkReviews(input.ratingAvg, input.reviewCount),
    completion: checkCompletion(input.bookings),
    verification: checkVerification(input.idVerificationStatus),
    complaints: checkComplaints(input.complaintCount),
  };
  const total = Math.round(
    (breakdown.profile.score * AUDIT_WEIGHTS.profile +
      breakdown.responseTime.score * AUDIT_WEIGHTS.responseTime +
      breakdown.reviews.score * AUDIT_WEIGHTS.reviews +
      breakdown.completion.score * AUDIT_WEIGHTS.completion +
      breakdown.verification.score * AUDIT_WEIGHTS.verification +
      breakdown.complaints.score * AUDIT_WEIGHTS.complaints) /
      100
  );
  const issues: string[] = [];
  if (breakdown.profile.score < 100) issues.push(breakdown.profile.detail);
  if (breakdown.responseTime.score < 60) issues.push(breakdown.responseTime.detail);
  if (breakdown.reviews.score < 60) issues.push(breakdown.reviews.detail);
  if (breakdown.completion.score < 60) issues.push(breakdown.completion.detail);
  if (breakdown.verification.score < 100) issues.push(breakdown.verification.detail);
  if (breakdown.complaints.score < 100) issues.push(breakdown.complaints.detail);

  const suggested: AuditScore['suggested'] =
    total >= 80 ? 'pass' : total >= 50 ? 'warning' : 'suspend';
  return { total, breakdown, issues, suggested };
}

export interface AuditCandidate {
  id: string;
  /** days since the provider row was created */
  ageDays: number;
  ratingAvg: number;
  reviewCount: number;
}

/**
 * Weighted random sample without replacement.
 * Weight = 1 + newProviderBoost (2.5 if ≤ 30 days old) + lowRatingBoost
 * (2.0 if rating < 3.5 with ≥ 3 reviews, 1.0 if no reviews yet).
 */
export function selectRandomProviders<T extends AuditCandidate>(
  candidates: T[],
  count: number
): T[] {
  const pool = candidates.map((c) => {
    let weight = 1;
    if (c.ageDays <= 30) weight += 2.5;
    if (c.reviewCount >= 3 && c.ratingAvg < 3.5) weight += 2.0;
    else if (c.reviewCount === 0) weight += 1.0;
    return { candidate: c, weight };
  });
  const picked: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * totalWeight;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    idx = Math.min(idx, pool.length - 1);
    picked.push(pool[idx].candidate);
    pool.splice(idx, 1);
  }
  return picked;
}

/** Human-readable label for an audit status. */
export function auditStatusLabel(status: string): string {
  switch (status) {
    case 'pass':
      return 'Passed';
    case 'warning':
      return 'Warning';
    case 'suspended':
      return 'Suspended';
    default:
      return 'Pending review';
  }
}
