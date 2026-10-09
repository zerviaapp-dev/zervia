'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import { rateLimit } from '@/lib/rate-limit';
import type { ActionResult } from './actions';

export type { ActionResult };

const REPORT_REASONS = ['spam', 'scam', 'inappropriate', 'fake', 'other'] as const;

async function moderationT(locale: string) {
  return getTranslations({ locale, namespace: 'Moderation' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

/**
 * File a moderation report against a listing (or provider).
 * Abuse-guarded: 10 reports per IP per hour. The DB unique index also
 * blocks duplicate open reports from the same reporter on one listing.
 */
export async function reportListing(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await moderationT(locale);

  if (!isSupabaseConfigured()) {
    return { ok: false, message: t('errorNotConfigured') };
  }
  if (!(await rateLimit('report', 10, 60 * 60 * 1000))) {
    return { ok: false, message: t('errorRateLimited') };
  }

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSignInRequired') };

  const listingId = String(formData.get('listingId') ?? '').trim() || null;
  const providerId = String(formData.get('providerId') ?? '').trim() || null;
  const reason = String(formData.get('reason') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim().slice(0, 2000);

  if (!listingId && !providerId) {
    return { ok: false, message: t('errorNoTarget') };
  }
  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
    return { ok: false, message: t('errorBadReason') };
  }

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    listing_id: listingId,
    provider_id: providerId,
    reason,
    details: details || null,
  });

  if (error) {
    // 23505 = already an open report from this reporter on this listing.
    if ('code' in error && error.code === '23505') {
      return { ok: false, message: t('errorAlreadyReported') };
    }
    return { ok: false, message: t('errorGeneric') };
  }

  return { ok: true, message: t('reportSubmitted') };
}

/** Admin: mark a report dismissed (no violation found). */
export async function dismissReport(formData: FormData): Promise<void> {
  const supabase = (await createClient())!;
  const reportId = String(formData.get('reportId') ?? '');
  if (!supabase || !reportId) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return;

  await supabase
    .from('reports')
    .update({ status: 'dismissed' })
    .eq('id', reportId);
  revalidatePath('/app/admin/moderation');
}

/**
 * Admin: action a report — pause the listing AND/OR flag the provider,
 * then mark the report actioned. One click removes the content from public.
 */
export async function actionReport(formData: FormData): Promise<void> {
  const supabase = (await createClient())!;
  const reportId = String(formData.get('reportId') ?? '');
  const listingId = String(formData.get('listingId') ?? '') || null;
  const providerId = String(formData.get('providerId') ?? '') || null;
  const pauseListing = formData.get('pauseListing') === 'on';
  const flagProvider = formData.get('flagProvider') === 'on';
  if (!supabase || !reportId) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return;

  if (pauseListing && listingId) {
    await supabase
      .from('listings')
      .update({ status: 'paused' })
      .eq('id', listingId);
  }
  if (flagProvider && providerId) {
    await supabase
      .from('providers')
      .update({ status: 'rejected' })
      .eq('id', providerId);
  }
  await supabase
    .from('reports')
    .update({ status: 'actioned' })
    .eq('id', reportId);
  revalidatePath('/app/admin/moderation');
}

/**
 * Admin: resolve a disputed booking. Actions: mark resolved (booking goes
 * back to the chosen status), or record an admin note. Refunds themselves
 * happen in Stripe (v1 never holds customer money), so the note documents
 * what was agreed — the money-safety guarantee stays intact.
 */
export async function resolveDispute(formData: FormData): Promise<void> {
  const supabase = (await createClient())!;
  const bookingId = String(formData.get('bookingId') ?? '');
  const outcome = String(formData.get('outcome') ?? ''); // 'completed' | 'cancelled'
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000);
  if (!supabase || !bookingId) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return;

  const nextStatus = outcome === 'completed' ? 'completed' : 'cancelled';
  const { error } = await supabase
    .from('bookings')
    .update({
      status: nextStatus,
      notes: note ? `[admin resolution] ${note}` : null,
    })
    .eq('id', bookingId)
    .eq('status', 'disputed'); // only disputed bookings can be resolved here

  if (!error) {
    // Notify both parties that the dispute was resolved.
    const { data: booking } = await supabase
      .from('bookings')
      .select('customer_id, provider_id')
      .eq('id', bookingId)
      .single();
    if (booking) {
      await supabase.from('notifications').insert([
        {
          user_id: booking.customer_id,
          type: 'dispute_resolved',
          title_key: 'Notifications.disputeResolvedTitle',
          link: `/app/bookings/${bookingId}`,
        },
        {
          user_id: booking.provider_id,
          type: 'dispute_resolved',
          title_key: 'Notifications.disputeResolvedTitle',
          link: `/app/provider/bookings`,
        },
      ]);
    }
  }
  revalidatePath('/app/admin/disputes');
}

/**
 * Request deletion (or export) of my data — GDPR/PIPEDA flow.
 * Creates a data_requests row the admin works through; the actual purge
 * is done by the admin in Supabase (documented in RECOVERY.md) so a bug
 * can never wipe the wrong rows.
 */
export async function requestDataAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await moderationT(locale);

  if (!isSupabaseConfigured()) {
    return { ok: false, message: t('errorNotConfigured') };
  }
  if (!(await rateLimit('data_request', 3, 24 * 60 * 60 * 1000))) {
    return { ok: false, message: t('errorRateLimited') };
  }

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSignInRequired') };

  const type = String(formData.get('type') ?? '');
  if (type !== 'deletion' && type !== 'export') {
    return { ok: false, message: t('errorBadType') };
  }

  const { error } = await supabase.from('data_requests').insert({
    user_id: user.id,
    type,
  });

  if (error) {
    if ('code' in error && error.code === '23505') {
      return { ok: false, message: t('errorRequestPending') };
    }
    return { ok: false, message: t('errorGeneric') };
  }
  return { ok: true, message: t('requestSubmitted') };
}
