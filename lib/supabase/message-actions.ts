'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import { rateLimit } from '@/lib/rate-limit';
import type { ActionResult } from './actions';
import { notifyUser } from './notifications';


async function chatT(locale: string) {
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
  t: Awaited<ReturnType<typeof chatT>>
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

/**
 * In-app notification, routed through the service-role client.
 * Migration 0036 revoked `notify_user` from `authenticated`, so the
 * session client can no longer call it — see `lib/supabase/notifications.ts`.
 */
async function notify(
  _supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  args: {
    userId: string;
    type: string;
    titleKey: string;
    bodyKey: string;
    bodyArgs?: Record<string, string>;
    link?: string;
  }
): Promise<void> {
  await notifyUser(args);
}

function bookingLink(id: string): string {
  return `/app/bookings/${id}`;
}

type BookingParty = {
  id: string;
  customer_id: string;
  provider_id: string;
  status: string;
  listings: { title: string } | null;
};

/** Load the booking and confirm the caller is a party (or admin). */
async function partyBooking(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
  bookingId: string
): Promise<
  | { ok: false }
  | { ok: true; booking: BookingParty; isProvider: boolean; isCustomer: boolean }
> {
  const { data: booking } = (await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, listings(title)')
    .eq('id', bookingId)
    .maybeSingle()) as { data: BookingParty | null };
  if (!booking) return { ok: false };
  const isCustomer = booking.customer_id === userId;
  const { data: providerRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  const isProvider =
    !!providerRow && (providerRow as { id: string }).id === booking.provider_id;
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isCustomer && !isProvider && isAdmin !== true) return { ok: false };
  return { ok: true, booking, isProvider, isCustomer };
}

/**
 * Send a chat message on a booking thread. Either party may write while the
 * booking is live. Rate-limited per IP (30/min) to blunt spam floods; the
 * DB RLS policy is the real authorization backstop.
 */
export async function sendMessage(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await chatT(locale);
  const bookingId = str(formData, 'bookingId');
  const body = str(formData, 'body');

  if (!bookingId) return { ok: false, message: t('errorGeneric') };
  if (body.length < 1 || body.length > 2000)
    return { ok: false, message: t('errorMessageLength') };

  if (!(await rateLimit('chat', 30, 60 * 1000))) {
    return { ok: false, message: t('errorRateLimited') };
  }

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const party = await partyBooking(supabase, userId, bookingId);
  if (!party.ok) return { ok: false, message: t('errorGeneric') };
  if (party.booking.status === 'cancelled')
    return { ok: false, message: t('errorChatClosed') };

  const { error } = await supabase.from('messages').insert({
    booking_id: bookingId,
    sender_id: userId,
    body,
  });
  if (error) return { ok: false, message: t('errorGeneric') };

  // Notify the other party.
  const { data: provRow } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', party.booking.provider_id)
    .single();
  const otherUserId = party.isCustomer
    ? (provRow as { user_id: string } | null)?.user_id
    : party.booking.customer_id;
  if (otherUserId && otherUserId !== userId) {
    await notify(supabase, {
      userId: otherUserId,
      type: 'chat_message',
      titleKey: 'chatMessageTitle',
      bodyKey: 'chatMessageBody',
      bodyArgs: { listing: party.booking.listings?.title ?? '' },
      link: bookingLink(bookingId),
    });
  }

  revalidatePath(localizedPath(bookingLink(bookingId), locale));
  return { ok: true, message: '' };
}

/**
 * Mark all messages from the other party on a booking thread as seen.
 * Called when the thread is opened and when new messages arrive.
 */
export async function markMessagesSeen(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const bookingId = str(formData, 'bookingId');
  const supabase = await createClient();
  if (!supabase || !bookingId) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // RLS admits only parties; the trigger keeps this to seen_at changes.
  await supabase
    .from('messages')
    .update({ seen_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .neq('sender_id', user.id)
    .is('seen_at', null);

  revalidatePath(localizedPath(bookingLink(bookingId), locale));
}
