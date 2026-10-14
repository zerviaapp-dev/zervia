'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from './server';
import { assertCeo } from './ceo-actions';
import { localizedPath } from '@/lib/locale-path';
import { defaultLocale } from '@/lib/locales';
import { notifyUser } from '@/lib/notify';
import {
  scoreProvider,
  selectRandomProviders,
  type AuditCheckInput,
} from '@/lib/audit';
import type { ActionResult } from './actions';


export interface AuditRow {
  id: string;
  provider_id: string;
  score: number;
  breakdown: Record<string, { score: number; detail: string }>;
  suggested: string;
  status: string;
  note: string | null;
  warning_deadline: string | null;
  created_at: string;
  batch_id: string | null;
  provider: { business_name: string; category: string } | null;
}

const BATCH_SIZE = 10;
const WARNING_DAYS = 7;

/**
 * Supabase `!inner` joins can type as object-or-array depending on the
 * generated types; normalize to a single object (or null).
 */
function first<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/** CEO gate shared by every audit action. Redirects non-CEOs away. */
async function requireCeo(locale: string) {
  const ceoId = await assertCeo();
  if (!ceoId) redirect(localizedPath('/app/dashboard', locale));
  return ceoId as string;
}

interface ProviderRow {
  id: string;
  user_id: string;
  business_name: string;
  description: string | null;
  category: string;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  rating_avg: number | string;
  review_count: number;
  id_verification_status: string;
  created_at: string;
}

/** Gather every input the scoring engine needs for one provider. */
async function gatherInputs(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  provider: ProviderRow
): Promise<AuditCheckInput> {
  // Active listings (services listed).
  const { count: activeListings } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', provider.id)
    .eq('status', 'active');

  // Booking outcomes.
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status, created_at')
    .eq('provider_id', provider.id);
  const b = bookings ?? [];
  const byStatus = (s: string) => b.filter((x) => x.status === s).length;

  // Response time: customer message → provider's next reply, last 180 days.
  let avgResponseHours: number | null = null;
  const recentIds = b
    .filter((x) => {
      const t = new Date(x.created_at).getTime();
      return Date.now() - t < 180 * 24 * 3600 * 1000;
    })
    .map((x) => x.id)
    .slice(0, 100);
  if (recentIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('sender_id, created_at')
      .in('booking_id', recentIds)
      .order('created_at', { ascending: true })
      .limit(500);
    const gaps: number[] = [];
    let waitingSince: number | null = null;
    for (const m of msgs ?? []) {
      const t = new Date(m.created_at).getTime();
      if (m.sender_id !== provider.user_id) {
        // Customer message — provider now owes a reply.
        if (waitingSince === null) waitingSince = t;
      } else if (waitingSince !== null) {
        // Provider replied — record the gap (ignore stale > 14 days).
        const gapH = (t - waitingSince) / 3600000;
        if (gapH >= 0 && gapH <= 14 * 24) gaps.push(gapH);
        waitingSince = null;
      }
    }
    if (gaps.length > 0) {
      avgResponseHours = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    }
  }

  // Complaints (open or actioned reports, last 180 days).
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const { count: complaints } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', provider.id)
    .in('status', ['open', 'actioned'])
    .gte('created_at', since);

  return {
    profileFields: {
      hasBusinessName: provider.business_name.trim().length >= 2,
      bioLength: (provider.description ?? '').trim().length,
      hasCategory: provider.category.trim().length > 0,
      hasContact: Boolean((provider.phone ?? '').trim() || (provider.whatsapp ?? '').trim()),
      activeListingCount: activeListings ?? 0,
    },
    avgResponseHours,
    ratingAvg: Number(provider.rating_avg ?? 0),
    reviewCount: provider.review_count ?? 0,
    bookings: {
      completed: byStatus('completed'),
      cancelled: byStatus('cancelled'),
      disputed: byStatus('disputed'),
      total: b.length,
    },
    idVerificationStatus: provider.id_verification_status ?? 'not_submitted',
    complaintCount: complaints ?? 0,
  };
}

/**
 * Run one full audit batch and persist the rows.
 * `runSource` is 'manual' for the CEO button, 'weekly_cron' for the
 * scheduled job. Returns the batch id + per-provider results.
 */
async function runBatch(
  runSource: 'manual' | 'weekly_cron'
): Promise<{ ok: boolean; batchId: string | null; count: number; message: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, batchId: null, count: 0, message: 'Supabase is not configured.' };
  }
  const supabase = (await createClient())!;

  // All active (approved) providers are candidates.
  const { data: providers, error } = await supabase
    .from('providers')
    .select(
      'id, user_id, business_name, description, category, city, phone, whatsapp, rating_avg, review_count, id_verification_status, created_at'
    )
    .eq('status', 'approved');
  if (error || !providers || providers.length === 0) {
    return { ok: false, batchId: null, count: 0, message: 'No active providers to audit.' };
  }

  // AuditCandidate (lib/audit.ts) uses camelCase scoring fields; keep the
  // full ProviderRow alongside for gatherInputs().
  type AuditableProvider = ProviderRow & {
    ageDays: number;
    ratingAvg: number;
    reviewCount: number;
  };
  const candidates: AuditableProvider[] = (providers as ProviderRow[]).map((p) => ({
    ...p,
    ageDays: Math.max(0, (Date.now() - new Date(p.created_at).getTime()) / 86400000),
    ratingAvg: Number(p.rating_avg ?? 0),
    reviewCount: p.review_count ?? 0,
  }));
  const picked = selectRandomProviders(candidates, BATCH_SIZE);

  const batchId = crypto.randomUUID();
  let count = 0;
  for (const p of picked) {
    try {
      const inputs = await gatherInputs(supabase, p);
      const result = scoreProvider(inputs);
      const { error: insertError } = await supabase.from('provider_audits').insert({
        provider_id: p.id,
        audited_by: null,
        run_source: runSource,
        batch_id: batchId,
        score: result.total,
        breakdown: result.breakdown,
        suggested: result.suggested,
        status: 'pending',
      });
      if (!insertError) count++;
    } catch {
      // One bad provider must not kill the whole batch.
    }
  }
  return { ok: count > 0, batchId, count, message: `${count} providers audited.` };
}

/**
 * CEO clicks "Run random audit" — audits 10 weighted-random providers.
 * Defence in depth: assertCeo() rejects anyone who is not the CEO/admin.
 */
export async function runRandomAudit(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  await requireCeo(locale);
  await runBatch('manual');
  revalidatePath(localizedPath('/app/admin/audits', locale));
}

/**
 * Weekly scheduled job (see lib/audit.ts cron notes).
 * Call from a platform cron every Monday ~06:00 UTC, e.g.:
 *
 *   // app/api/cron/weekly-audit/route.ts  (guard with CRON_SECRET)
 *   const summary = await runWeeklyAuditBatch();
 *   await emailCeo(summary); // subject: "Weekly provider audit — N flagged"
 *
 * The cron NEVER suspends anyone: rows land as 'pending' and the CEO
 * confirms pass/warning/suspend on /app/admin/audits.
 */
export async function runWeeklyAuditBatch(): Promise<{
  ok: boolean;
  batchId: string | null;
  count: number;
  flagged: Array<{ providerId: string; businessName: string; score: number; suggested: string }>;
}> {
  const res = await runBatch('weekly_cron');
  const flagged: Array<{
    providerId: string;
    businessName: string;
    score: number;
    suggested: string;
  }> = [];
  if (res.ok && res.batchId && isSupabaseConfigured()) {
    const supabase = (await createClient())!;
    const { data } = await supabase
      .from('provider_audits')
      .select('provider_id, score, suggested, providers!inner(business_name)')
      .eq('batch_id', res.batchId)
      .neq('suggested', 'pass');
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const prov = first(row.providers as { business_name: string } | Array<{ business_name: string }>);
      flagged.push({
        providerId: String(row.provider_id),
        businessName: prov?.business_name ?? String(row.provider_id).slice(0, 8),
        score: Number(row.score),
        suggested: String(row.suggested),
      });
    }
  }
  return { ok: res.ok, batchId: res.batchId, count: res.count, flagged };
}

/** Latest audit batch (for the dashboard results table). */
export async function getLatestAuditBatch(): Promise<AuditRow[]> {
  if (!(await assertCeo())) return [];
  const supabase = (await createClient())!;
  const { data: latest } = await supabase
    .from('provider_audits')
    .select('batch_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const batchId = (latest as { batch_id: string | null } | null)?.batch_id;
  if (!batchId) return [];
  const { data, error } = await supabase
    .from('provider_audits')
    .select('id, provider_id, score, breakdown, suggested, status, note, warning_deadline, created_at, batch_id, providers!inner(business_name, category)')
    .eq('batch_id', batchId)
    .order('score', { ascending: true });
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => {
    const prov = first(
      r.providers as { business_name: string; category: string } | Array<{ business_name: string; category: string }>
    );
    return {
      id: String(r.id),
      provider_id: String(r.provider_id),
      score: Number(r.score),
      breakdown: (r.breakdown ?? {}) as AuditRow['breakdown'],
      suggested: String(r.suggested),
      status: String(r.status),
      note: (r.note as string | null) ?? null,
      warning_deadline: (r.warning_deadline as string | null) ?? null,
      created_at: String(r.created_at),
      batch_id: (r.batch_id as string | null) ?? null,
      provider: prov,
    } satisfies AuditRow;
  });
}

/** Recent audit history across all batches. */
export async function getAuditHistory(limit = 50): Promise<AuditRow[]> {
  if (!(await assertCeo())) return [];
  const supabase = (await createClient())!;
  const { data, error } = await supabase
    .from('provider_audits')
    .select('id, provider_id, score, breakdown, suggested, status, note, warning_deadline, created_at, batch_id, providers!inner(business_name, category)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => {
    const prov = first(
      r.providers as { business_name: string; category: string } | Array<{ business_name: string; category: string }>
    );
    return {
      id: String(r.id),
      provider_id: String(r.provider_id),
      score: Number(r.score),
      breakdown: (r.breakdown ?? {}) as AuditRow['breakdown'],
      suggested: String(r.suggested),
      status: String(r.status),
      note: (r.note as string | null) ?? null,
      warning_deadline: (r.warning_deadline as string | null) ?? null,
      created_at: String(r.created_at),
      batch_id: (r.batch_id as string | null) ?? null,
      provider: prov,
    } satisfies AuditRow;
  });
}

const VALID_VERDICTS = ['pass', 'warning', 'suspended'] as const;

/**
 * CEO records a verdict on one audit row.
 *
 * AUDITS NEVER TOUCH STRIPE: no verdict charges, refunds, holds, or
 * moves money. The only money effect is the automatic fee discount
 * granted on 'pass' (8% free / 4% member for 6 months) via the
 * platform-fee engine (lib/pricing.ts) — no payment is processed here.
 *
 * - pass: provider earns the 🏅 Audited badge + fee discount for 6 months
 *   (audited_until = now + 6 months) and gets a "Great job" in-app notice.
 * - warning: 7-day deadline + in-app notice listing what to fix; any
 *   existing badge is cleared.
 * - suspended: provider row → status 'suspended' (hidden from marketplace),
 *   badge cleared + in-app notice.
 */
export async function setAuditStatus(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const ceoId = await requireCeo(locale);
  const auditId = str(formData, 'auditId');
  const verdict = str(formData, 'verdict');
  const note = str(formData, 'note').slice(0, 2000);

  if (!VALID_VERDICTS.includes(verdict as (typeof VALID_VERDICTS)[number])) return;
  if (!isSupabaseConfigured()) return;
  const supabase = (await createClient())!;

  const { data: audit } = await supabase
    .from('provider_audits')
    // NOTE: audits are quality checks ONLY — they never touch Stripe,
    // never charge, refund, hold, or move money. The only money effect
    // is the automatic fee discount for passing providers (8% free /
    // 4% member for 6 months), applied by the platform-fee engine.
    .select('id, provider_id, score, breakdown, providers!inner(user_id, business_name)')
    .eq('id', auditId)
    .single();
  if (!audit) return;
  const a = audit as Record<string, unknown>;
  const prov = first(
    a.providers as { user_id: string; business_name: string } | Array<{ user_id: string; business_name: string }>
  );
  if (!prov) return;
  const row = {
    id: String(a.id),
    provider_id: String(a.provider_id),
    score: Number(a.score),
    breakdown: (a.breakdown ?? {}) as Record<string, { score: number; detail: string }>,
    providers: prov,
  };

  const patch: Record<string, unknown> = {
    status: verdict,
    note: note || null,
    audited_by: ceoId,
    resolved_at: new Date().toISOString(),
  };
  let deadline: string | null = null;
  if (verdict === 'warning') {
    deadline = new Date(Date.now() + WARNING_DAYS * 86400000).toISOString();
    patch.warning_deadline = deadline;
  }
  const { error } = await supabase
    .from('provider_audits')
    .update(patch)
    .eq('id', auditId);
  if (error) return;

  // Badge + fee discount live on the provider row. Pass → valid 6 months;
  // anything else clears it. (Column may not exist until migration 0035
  // is applied — tolerate the failure so verdicts still save.)
  if (verdict === 'pass') {
    const validUntil = new Date(
      Date.now() + 6 * 30 * 86400000
    ).toISOString();
    await supabase
      .from('providers')
      .update({ audited_until: validUntil })
      .eq('id', row.provider_id);
  } else {
    await supabase
      .from('providers')
      .update({ audited_until: null })
      .eq('id', row.provider_id);
  }

  // Suspend the provider account itself.
  if (verdict === 'suspended') {
    await supabase
      .from('providers')
      .update({ status: 'suspended' })
      .eq('id', row.provider_id);
  }

  // In-app notice to the provider (in-app only — no external channels).
  const event =
    verdict === 'pass'
      ? 'audit_passed'
      : verdict === 'warning'
        ? 'audit_warning'
        : 'audit_suspended';
  const issues = Object.values(row.breakdown ?? {})
    .filter((c) => c.score < 100)
    .map((c) => c.detail)
    .slice(0, 5)
    .join('; ');
  await notifyUser({
    userId: row.providers.user_id,
    event,
    params: { name: row.providers.business_name },
    channels: [],
    inApp: {
      type: event,
      titleKey: `Notifications.${event === 'audit_passed' ? 'auditPassedTitle' : event === 'audit_warning' ? 'auditWarningTitle' : 'auditSuspendedTitle'}`,
      bodyKey: `Notifications.${event === 'audit_passed' ? 'auditPassedBody' : event === 'audit_warning' ? 'auditWarningBody' : 'auditSuspendedBody'}`,
      bodyArgs: {
        score: String(row.score),
        issues: issues || '—',
        deadline: deadline ? new Date(deadline).toLocaleDateString() : '',
      },
      link: '/app/provider',
    },
  });

  revalidatePath(localizedPath('/app/admin/audits', locale));
}
