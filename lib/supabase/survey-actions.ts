'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import { rateLimit } from '@/lib/rate-limit';
import type { ActionResult } from './actions';
import { notifyUser } from './notifications';

async function surveyT(locale: string) {
  return getTranslations({ locale, namespace: 'Bookings' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

type Session =
  | { ok: false; message: string }
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
      userId: string;
    };

async function requireUser(
  t: Awaited<ReturnType<typeof surveyT>>
): Promise<Session> {
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };
  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSessionExpired') };
  return { ok: true, supabase, userId: user.id };
}

function bookingLink(bookingId: string): string {
  return `/app/bookings/${bookingId}`;
}

type SurveyBookingRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  status: string;
  listings: { title: string };
};

function inRange(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

/**
 * Submit the REQUIRED post-service survey for a completed booking.
 * CEO requirement (Oct 2026): after a service is completed, the customer
 * MUST complete a survey/rating.
 *
 * Guards: booking exists + completed + belongs to the caller, no survey
 * exists yet (UNIQUE on booking_id is the DB-level guarantee), all
 * required fields valid.
 */
export async function submitPostServiceSurvey(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await surveyT(locale);

  const bookingId = str(formData, 'bookingId');
  const rating = Number(str(formData, 'rating'));
  const quality = Number(str(formData, 'quality'));
  const punctuality = Number(str(formData, 'punctuality'));
  const communication = Number(str(formData, 'communication'));
  const wouldRecommendRaw = str(formData, 'wouldRecommend');
  const comments = str(formData, 'comments');

  if (!bookingId) return { ok: false, message: t('errorGeneric') };
  if (
    !inRange(rating) ||
    !inRange(quality) ||
    !inRange(punctuality) ||
    !inRange(communication)
  )
    return { ok: false, message: t('surveyError') };
  if (wouldRecommendRaw !== 'yes' && wouldRecommendRaw !== 'no')
    return { ok: false, message: t('surveyError') };
  if (comments.length > 2000) return { ok: false, message: t('errorReviewTooLong') };

  // Abuse guard: 10 survey submissions per IP per hour.
  if (!(await rateLimit('survey', 10, 60 * 60 * 1000))) {
    return { ok: false, message: t('errorRateLimited') };
  }

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const { data: booking } = (await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, listings!inner(title)')
    .eq('id', bookingId)
    .maybeSingle()) as { data: SurveyBookingRow | null };
  if (!booking) return { ok: false, message: t('errorGeneric') };
  if (booking.status !== 'completed')
    return { ok: false, message: t('errorReviewNotAllowed') };
  if (booking.customer_id !== userId)
    return { ok: false, message: t('errorGeneric') };

  const { data: existing } = await supabase
    .from('post_service_surveys')
    .select('id')
    .eq('booking_id', booking.id)
    .maybeSingle();
  if (existing) return { ok: false, message: t('surveyAlreadySubmitted') };

  const { error } = await supabase.from('post_service_surveys').insert({
    booking_id: booking.id,
    customer_id: userId,
    provider_id: booking.provider_id,
    rating,
    quality,
    punctuality,
    communication,
    would_recommend: wouldRecommendRaw === 'yes',
    comments: comments || null,
  });
  if (error) return { ok: false, message: t('errorGeneric') };

  // Notify the provider that a survey was received.
  const { data: prov } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', booking.provider_id)
    .single();
  if (prov) {
    await notifyUser({
      userId: prov.user_id,
      type: 'survey_received',
      titleKey: 'surveyReceivedTitle',
      bodyKey: 'surveyReceivedBody',
      bodyArgs: { listing: booking.listings.title, rating: String(rating) },
      link: '/app/provider/bookings',
    });
  }

  revalidatePath(localizedPath(bookingLink(booking.id), locale));
  redirect(localizedPath(bookingLink(booking.id), locale));
}
