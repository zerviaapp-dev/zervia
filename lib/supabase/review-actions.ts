'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import type { ActionResult } from './actions';

async function reviewT(locale: string) {
  return getTranslations({ locale, namespace: 'Bookings' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

async function notify(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  args: {
    userId: string;
    type: string;
    titleKey: string;
    bodyKey: string;
    bodyArgs?: Record<string, string>;
    link?: string;
  }
): Promise<void> {
  await supabase.rpc('notify_user', {
    p_user_id: args.userId,
    p_type: args.type,
    p_title_key: args.titleKey,
    p_body_key: args.bodyKey,
    p_body_args: args.bodyArgs ?? {},
    p_link: args.link ?? null,
  });
}

/**
 * Provider taps "Ask for review" on a completed booking → the customer
 * gets a polite notification with a deep link to the review form.
 * One nudge max per booking (guarded by review_requested_at).
 *
 * Guards: booking exists + completed, caller owns the provider row,
 * no review exists yet, not already requested.
 */
export async function requestReview(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await reviewT(locale);

  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };
  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSessionExpired') };

  const bookingId = String(formData.get('bookingId') ?? '').trim();
  if (!bookingId) return { ok: false, message: t('errorGeneric') };

  // Caller's provider row.
  const { data: providerRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!providerRow) return { ok: false, message: t('errorGeneric') };

  // The booking: must be completed and belong to this provider.
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, review_requested_at')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking || booking.provider_id !== providerRow.id)
    return { ok: false, message: t('errorGeneric') };
  if (booking.status !== 'completed')
    return { ok: false, message: t('reviewRequestNotCompleted') };
  if (booking.review_requested_at)
    return { ok: false, message: t('reviewRequestAlreadySent') };

  // A review already exists → nothing to ask for.
  const { data: existingReview } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (existingReview)
    return { ok: false, message: t('reviewRequestAlreadyReviewed') };

  // Mark requested (one nudge max).
  const { error: stampError } = await supabase
    .from('bookings')
    .update({ review_requested_at: new Date().toISOString() })
    .eq('id', bookingId)
    .is('review_requested_at', null);
  if (stampError) return { ok: false, message: t('errorGeneric') };

  // Notify the customer with a deep link to the booking (review form lives
  // on the booking detail page for customers).
  await notify(supabase, {
    userId: booking.customer_id,
    type: 'review_requested',
    titleKey: 'reviewRequestedTitle',
    bodyKey: 'reviewRequestedBody',
    link: `/app/bookings/${bookingId}`,
  });

  revalidatePath(localizedPath(`/app/bookings/${bookingId}`, locale));
  return { ok: true, message: t('reviewRequestSent') };
}
