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


async function quoteT(locale: string) {
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
  t: Awaited<ReturnType<typeof quoteT>>
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
 * In-app notification via the service-role client. Migration 0036 revoked
 * `notify_user` from `authenticated` — see `lib/supabase/notifications.ts`.
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

type QuoteBooking = {
  id: string;
  customer_id: string;
  provider_id: string;
  status: string;
  listings: { title: string } | null;
};

async function loadBooking(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  bookingId: string
): Promise<QuoteBooking | null> {
  const { data } = (await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, listings(title)')
    .eq('id', bookingId)
    .maybeSingle()) as { data: QuoteBooking | null };
  return data;
}

async function providerUserId(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  providerId: string
): Promise<string | null> {
  const { data } = (await supabase
    .from('providers')
    .select('user_id')
    .eq('id', providerId)
    .single()) as { data: { user_id: string } | null };
  return data?.user_id ?? null;
}

function parsePrice(raw: string): number | null {
  // Accepts "49.99" or "49,99" or "50" — stored as integer cents.
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  if (!normalized) return null;
  const value = Math.round(Number(normalized) * 100);
  if (!Number.isFinite(value) || value < 0 || value > 100000000) return null;
  return value;
}

/**
 * Provider sends a structured quote on a pending/confirmed booking.
 * Any older 'sent' quote on the booking is superseded (expired) — one
 * live offer at a time keeps the thread unambiguous.
 */
export async function sendQuote(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await quoteT(locale);
  const bookingId = str(formData, 'bookingId');
  const scope = str(formData, 'scope');
  const priceCents = parsePrice(str(formData, 'price'));
  const proposedRaw = str(formData, 'proposedAt');

  if (!bookingId) return { ok: false, message: t('errorGeneric') };
  if (scope.length < 1 || scope.length > 1000)
    return { ok: false, message: t('errorQuoteScope') };
  if (priceCents === null) return { ok: false, message: t('errorQuotePrice') };

  let proposedAt: string | null = null;
  if (proposedRaw) {
    const dt = new Date(proposedRaw);
    if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now())
      return { ok: false, message: t('errorQuoteTime') };
    proposedAt = dt.toISOString();
  }

  if (!(await rateLimit('quote', 10, 60 * 60 * 1000))) {
    return { ok: false, message: t('errorRateLimited') };
  }

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const booking = await loadBooking(supabase, bookingId);
  if (!booking) return { ok: false, message: t('errorGeneric') };
  if (!['pending', 'confirmed'].includes(booking.status))
    return { ok: false, message: t('errorQuoteNotAllowed') };

  const { data: providerRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!providerRow || (providerRow as { id: string }).id !== booking.provider_id)
    return { ok: false, message: t('errorGeneric') };

  // Supersede any older live quote, then insert the new one.
  await supabase
    .from('quotes')
    .update({ status: 'expired' })
    .eq('booking_id', bookingId)
    .eq('status', 'sent');

  const { error } = await supabase.from('quotes').insert({
    booking_id: bookingId,
    provider_id: booking.provider_id,
    price_cents: priceCents,
    scope,
    proposed_at: proposedAt,
    status: 'sent',
  });
  if (error) return { ok: false, message: t('errorGeneric') };

  await notify(supabase, {
    userId: booking.customer_id,
    type: 'quote_received',
    titleKey: 'quoteReceivedTitle',
    bodyKey: 'quoteReceivedBody',
    bodyArgs: { listing: booking.listings?.title ?? '' },
    link: bookingLink(bookingId),
  });

  revalidatePath(localizedPath(bookingLink(bookingId), locale));
  return { ok: true, message: t('quoteSent') };
}

/**
 * Customer accepts or declines a quote. Acceptance locks the agreed price
 * onto the booking (DB trigger) and expires superseded quotes.
 */
export async function respondQuote(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const t = await quoteT(locale);
  const quoteId = str(formData, 'quoteId');
  const decision = str(formData, 'decision');

  const session = await requireUser(t);
  if (!session.ok) redirect(localizedPath('/app/bookings', locale));
  const { supabase, userId } = session;

  if (!quoteId || !['accepted', 'declined'].includes(decision)) {
    redirect(localizedPath('/app/bookings', locale));
  }

  const { data: quote } = (await supabase
    .from('quotes')
    .select('id, booking_id, status, bookings!inner(id, customer_id, provider_id, listings(title))')
    .eq('id', quoteId)
    .maybeSingle()) as {
    data: {
      id: string;
      booking_id: string;
      status: string;
      bookings: { id: string; customer_id: string; provider_id: string; listings: { title: string } | null };
    } | null;
  };
  if (!quote || quote.status !== 'sent') {
    redirect(localizedPath('/app/bookings', locale));
  }
  if (quote.bookings.customer_id !== userId) {
    redirect(localizedPath(bookingLink(quote.booking_id), locale));
  }

  const { error } = await supabase
    .from('quotes')
    .update({ status: decision })
    .eq('id', quote.id);
  if (error) redirect(localizedPath(bookingLink(quote.booking_id), locale));

  const provUserId = await providerUserId(supabase, quote.bookings.provider_id);
  if (provUserId) {
    await notify(supabase, {
      userId: provUserId,
      type: decision === 'accepted' ? 'quote_accepted' : 'quote_declined',
      titleKey: decision === 'accepted' ? 'quoteAcceptedTitle' : 'quoteDeclinedTitle',
      bodyKey: decision === 'accepted' ? 'quoteAcceptedBody' : 'quoteDeclinedBody',
      bodyArgs: { listing: quote.bookings.listings?.title ?? '' },
      link: '/app/provider/bookings',
    });
  }

  revalidatePath(localizedPath(bookingLink(quote.booking_id), locale));
  redirect(localizedPath(bookingLink(quote.booking_id), locale));
}
