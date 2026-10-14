'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import { rateLimit } from '@/lib/rate-limit';
import type { ActionResult } from './actions';
import { autoReleaseEscrow, refundEscrowOnCancel } from './escrow-actions';
import { applyOfferRewards } from './offer-actions';
import { notifyUser } from './notifications';
import {
  platformFeeCents,
  isMemberSubscription,
  isAuditBadgeValid,
} from '@/lib/pricing';


/**
 * Record the platform fee when a booking completes.
 * Free providers: 10% (8% with a valid 🏅 Audited badge).
 * Members (active pro/business subscription): 5% (4% with badge).
 * Never throws — a fee-recording hiccup must not break completion.
 */
async function recordPlatformFee(bookingId: string): Promise<void> {
  try {
    const { createAdminClient } = await import('./admin');
    const admin = createAdminClient();
    if (!admin) return;

    // Booking amount: agreed price, else the listing's fixed price.
    const { data: booking } = await admin
      .from('bookings')
      .select(
        'id, customer_id, provider_id, agreed_price_cents, listings!inner(price_cents, price_type)'
      )
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) return;
    const listing = Array.isArray(booking.listings)
      ? booking.listings[0]
      : booking.listings;
    const amountCents =
      booking.agreed_price_cents ??
      (listing?.price_type === 'fixed' ? listing?.price_cents : null);
    if (!amountCents || amountCents <= 0) return;

    // Membership: active pro/business subscription?
    const { data: sub } = await admin
      .from('subscriptions')
      .select('tier, status')
      .eq('provider_id', booking.provider_id)
      .maybeSingle();
    const isMember = isMemberSubscription(sub);
    // Audited discount: valid 🏅 badge lowers the fee (8% free / 4% member).
    const { data: provider } = await admin
      .from('providers')
      .select('audited_until')
      .eq('id', booking.provider_id)
      .maybeSingle();
    const isAudited = isAuditBadgeValid(
      (provider as { audited_until: string | null } | null)?.audited_until ?? null
    );
    const feeCents = platformFeeCents(amountCents, isMember, isAudited);
    if (feeCents <= 0) return;

    // Idempotency: don't double-record for the same booking.
    const { data: existing } = await admin
      .from('transactions')
      .select('id')
      .eq('type', 'platform_fee')
      .eq('description', `Platform fee for booking ${bookingId}`)
      .maybeSingle();
    if (existing) return;

    await admin.from('transactions').insert({
      user_id: booking.customer_id,
      provider_id: booking.provider_id,
      amount_cents: feeCents,
      currency: 'cad',
      type: 'platform_fee',
      status: 'succeeded',
      description: `Platform fee for booking ${bookingId}`,
    });
  } catch (err) {
    console.error('[booking] platform fee recording failed', bookingId, err);
  }
}

async function bookingT(locale: string) {
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
  t: Awaited<ReturnType<typeof bookingT>>
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

type BookingRow = {
  id: string;
  listing_id: string;
  customer_id: string;
  provider_id: string;
  scheduled_at: string | null;
  status: string;
  notes: string | null;
  dispute_reason: string | null;
  created_at: string;
};

/** The caller's provider row (id + owner's user id), or null. */
async function ownProvider(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

/** Send an in-app notification via the service-role client (migration 0036
 * revoked `notify_user` from `authenticated` — the session client can no
 * longer call it). See `lib/supabase/notifications.ts`. */
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

/**
 * Customer requests a booking on a listing. Creates a `pending` booking.
 * Guards: listing must be visible (active + approved provider — RLS decides),
 * never your own listing, date must be in the future, and no overlapping
 * pending/confirmed booking for the same listing within ±1 hour
 * (double-booking prevention; duration-aware scheduling is a later upgrade).
 */
export async function requestBooking(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await bookingT(locale);

  const listingId = str(formData, 'listingId');
  const dateRaw = str(formData, 'scheduledDate');
  const timeRaw = str(formData, 'scheduledTime');
  const notes = str(formData, 'notes');

  if (!listingId) return { ok: false, message: t('errorGeneric') };
  if (notes.length > 2000) return { ok: false, message: t('errorNotesTooLong') };

  let scheduledAt: string | null = null;
  if (dateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw))
      return { ok: false, message: t('errorDate') };
    const time = /^\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : '09:00';
    const dt = new Date(`${dateRaw}T${time}:00`);
    if (Number.isNaN(dt.getTime()))
      return { ok: false, message: t('errorDate') };
    if (dt.getTime() <= Date.now() + 30 * 60 * 1000)
      return { ok: false, message: t('errorPastDate') };
    scheduledAt = dt.toISOString();
  }

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  // The listing must be publicly visible to the customer (RLS: active +
  // approved provider). Anything else → not bookable, no hint it exists.
  const { data: listing } = (await supabase
    .from('listings')
    .select('id, title, provider_id, providers!inner(id, user_id, status)')
    .eq('id', listingId)
    .maybeSingle()) as {
    data: {
      id: string;
      title: string;
      provider_id: string;
      providers: { id: string; user_id: string; status: string };
    } | null;
  };
  if (!listing) return { ok: false, message: t('errorListingUnavailable') };
  if (listing.providers.user_id === userId)
    return { ok: false, message: t('errorOwnListing') };

  // Double-booking prevention: no other live booking on this listing
  // within ±1 hour of the requested time.
  if (scheduledAt) {
    const windowStart = new Date(
      new Date(scheduledAt).getTime() - 60 * 60 * 1000
    ).toISOString();
    const windowEnd = new Date(
      new Date(scheduledAt).getTime() + 60 * 60 * 1000
    ).toISOString();
    const { data: clash } = await supabase
      .from('bookings')
      .select('id')
      .eq('listing_id', listingId)
      .in('status', ['pending', 'confirmed'])
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)
      .limit(1);
    if (clash && clash.length > 0)
      return { ok: false, message: t('errorSlotTaken') };
  }

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      listing_id: listingId,
      customer_id: userId,
      provider_id: listing.provider_id,
      scheduled_at: scheduledAt,
      notes: notes || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !booking) return { ok: false, message: t('errorGeneric') };

  await notify(supabase, {
    userId: listing.providers.user_id,
    type: 'booking_request',
    titleKey: 'bookingRequestTitle',
    bodyKey: 'bookingRequestBody',
    bodyArgs: { listing: listing.title },
    link: '/app/provider/bookings',
  });

  redirect(localizedPath('/app/bookings', locale));
}

type StatusMove = 'confirmed' | 'in_progress' | 'cancelled' | 'completed';

/**
 * Move a booking to confirmed / in_progress / cancelled / completed.
 * Role rules (the DB transition trigger is the final authority):
 *  - customer: pending|confirmed|in_progress → cancelled
 *  - provider: pending → confirmed | cancelled; confirmed → in_progress | cancelled;
 *              in_progress → completed | cancelled
 *  - admin: any legal move
 */
export async function setBookingStatus(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const t = await bookingT(locale);
  const bookingId = str(formData, 'id');
  const target = str(formData, 'status') as StatusMove;

  const session = await requireUser(t);
  if (!session.ok) redirect(localizedPath('/app/bookings', locale));
  const { supabase, userId } = session;

  if (
    !bookingId ||
    !['confirmed', 'in_progress', 'cancelled', 'completed'].includes(target)
  ) {
    redirect(localizedPath('/app/bookings', locale));
  }

  const { data: booking } = (await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, listings!inner(title)')
    .eq('id', bookingId)
    .maybeSingle()) as {
    data: (BookingRow & { listings: { title: string } }) | null;
  };
  if (!booking) redirect(localizedPath('/app/bookings', locale));

  const provider = await ownProvider(supabase, userId);
  const isCustomer = booking.customer_id === userId;
  const isProvider = provider?.id === booking.provider_id;
  const { data: isAdmin } = await supabase.rpc('is_admin');

  const allowed =
    isAdmin === true ||
    (isCustomer &&
      target === 'cancelled' &&
      ['pending', 'confirmed', 'in_progress'].includes(booking.status)) ||
    (isProvider &&
      ((target === 'confirmed' && booking.status === 'pending') ||
        (target === 'cancelled' &&
          ['pending', 'confirmed', 'in_progress'].includes(booking.status)) ||
        (target === 'in_progress' && booking.status === 'confirmed') ||
        (target === 'completed' &&
          ['confirmed', 'in_progress'].includes(booking.status))));

  if (!allowed) redirect(localizedPath(bookingLink(booking.id), locale));

  const { error } = await supabase
    .from('bookings')
    .update({ status: target })
    .eq('id', booking.id);
  if (error) redirect(localizedPath(bookingLink(booking.id), locale));

  // Held escrow auto-releases when the job completes: the provider did
  // the work, so the secured payment is captured for them. Never throws —
  // a Stripe hiccup must not break the completion itself.
  if (target === 'completed') {
    await autoReleaseEscrow(booking.id);
    // Merchant offers: award points for any loaded, qualifying offers.
    // Never throws — rewards must not break completion.
    await applyOfferRewards(booking.id);
    // Platform fee: 10% free providers, 5% members. Recorded as a
    // transaction for the provider's billing history. Never throws.
    await recordPlatformFee(booking.id);
  }

  // Held escrow auto-refunds when the booking is cancelled: the job didn't
  // happen, so the customer's money goes back. Never throws — a Stripe
  // hiccup must not break the cancellation itself.
  if (target === 'cancelled') {
    await refundEscrowOnCancel(booking.id);
  }

  // Notify the affected parties.
  const bId = booking.id;
  const custId = booking.customer_id;
  const listingTitle = booking.listings.title;
  const { data: provRow } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', booking.provider_id)
    .single();

  async function notifyCustomer(
    type: string,
    titleKey: string,
    bodyKey: string
  ): Promise<void> {
    await notify(supabase, {
      userId: custId,
      type,
      titleKey,
      bodyKey,
      bodyArgs: { listing: listingTitle },
      link: bookingLink(bId),
    });
  }

  async function notifyProviderUser(
    type: string,
    titleKey: string,
    bodyKey: string
  ): Promise<void> {
    if (provRow) {
      await notify(supabase, {
        userId: provRow.user_id,
        type,
        titleKey,
        bodyKey,
        bodyArgs: { listing: listingTitle },
        link: '/app/provider/bookings',
      });
    }
  }

  if (target === 'confirmed') {
    await notifyCustomer(
      'booking_confirmed',
      'bookingConfirmedTitle',
      'bookingConfirmedBody'
    );
  } else if (target === 'in_progress') {
    await notifyCustomer(
      'booking_started',
      'bookingStartedTitle',
      'bookingStartedBody'
    );
  } else if (target === 'cancelled') {
    // Whoever didn't cancel hears about it; an admin cancelling tells both.
    if (isCustomer || isAdmin === true) {
      await notifyProviderUser(
        'booking_cancelled',
        'bookingCancelledTitle',
        'bookingCancelledBody'
      );
    }
    if (isProvider || isAdmin === true) {
      await notifyCustomer(
        'booking_cancelled',
        'bookingCancelledTitle',
        'bookingCancelledBody'
      );
    }
  } else if (target === 'completed') {
    await notifyCustomer(
      'booking_completed',
      'bookingCompletedTitle',
      'bookingCompletedBody'
    );
  }

  revalidatePath(localizedPath(bookingLink(booking.id), locale));
  revalidatePath(localizedPath('/app/bookings', locale));
  revalidatePath(localizedPath('/app/provider/bookings', locale));
}

/**
 * Flag a booking as disputed with a reason (10–2000 chars). Either party
 * may dispute a pending/confirmed/in_progress booking; the DB trigger demands the
 * reason and only admins move it out of disputed (Phase 6 resolution UI).
 */
export async function disputeBooking(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await bookingT(locale);

  const bookingId = str(formData, 'id');
  const reason = str(formData, 'reason');
  if (!bookingId) return { ok: false, message: t('errorGeneric') };
  if (reason.length < 10 || reason.length > 2000)
    return { ok: false, message: t('errorDisputeReason') };

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const { data: booking } = (await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, listings!inner(title)')
    .eq('id', bookingId)
    .maybeSingle()) as {
    data: (BookingRow & { listings: { title: string } }) | null;
  };
  if (!booking) return { ok: false, message: t('errorGeneric') };
  if (!['pending', 'confirmed', 'in_progress'].includes(booking.status))
    return { ok: false, message: t('errorDisputeNotAllowed') };

  const provider = await ownProvider(supabase, userId);
  const isCustomer = booking.customer_id === userId;
  const isProvider = provider?.id === booking.provider_id;
  if (!isCustomer && !isProvider)
    return { ok: false, message: t('errorGeneric') };

  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'disputed',
      dispute_reason: reason,
      disputed_by: userId,
    })
    .eq('id', booking.id);
  if (error) return { ok: false, message: t('errorGeneric') };

  // Tell the other party.
  const otherUserId = isCustomer
    ? (
        await supabase
          .from('providers')
          .select('user_id')
          .eq('id', booking.provider_id)
          .single()
      ).data?.user_id
    : booking.customer_id;
  if (otherUserId) {
    await notify(supabase, {
      userId: otherUserId,
      type: 'booking_disputed',
      titleKey: 'bookingDisputedTitle',
      bodyKey: 'bookingDisputedBody',
      bodyArgs: { listing: booking.listings.title },
      link: isCustomer ? '/app/provider/bookings' : bookingLink(booking.id),
    });
  }

  redirect(localizedPath(bookingLink(booking.id), locale));
}

/**
 * Leave a review: one per booking, only after completion, only by the
 * booking customer. The DB trigger (guard_review_eligibility) is the
 * primary enforcer; these checks give friendly errors first.
 */
export async function submitReview(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await bookingT(locale);

  const bookingId = str(formData, 'bookingId');
  const rating = Number(str(formData, 'rating'));
  const text = str(formData, 'text');

  // Optional before/after photos (client-uploaded URLs, max 3).
  let photoUrls: string[] = [];
  try {
    const parsed: unknown = JSON.parse(str(formData, 'photo_urls') || '[]');
    if (Array.isArray(parsed)) {
      photoUrls = parsed
        .filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u))
        .slice(0, 3);
    }
  } catch {
    photoUrls = [];
  }

  if (!bookingId) return { ok: false, message: t('errorGeneric') };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return { ok: false, message: t('errorRating') };
  if (text.length > 2000) return { ok: false, message: t('errorReviewTooLong') };

  // Review-velocity guard: 5 reviews per IP per hour. Fake 5-star farms
  // submit in bursts; this makes that expensive. (The DB trigger remains
  // the real integrity guarantee: one review per completed booking.)
  if (!(await rateLimit('review', 5, 60 * 60 * 1000))) {
    return { ok: false, message: t('errorRateLimited') };
  }

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const { data: booking } = (await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, listings!inner(title)')
    .eq('id', bookingId)
    .maybeSingle()) as {
    data: (BookingRow & { listings: { title: string } }) | null;
  };
  if (!booking) return { ok: false, message: t('errorGeneric') };
  if (booking.status !== 'completed')
    return { ok: false, message: t('errorReviewNotAllowed') };
  if (booking.customer_id !== userId)
    return { ok: false, message: t('errorGeneric') };

  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', booking.id)
    .maybeSingle();
  if (existing) return { ok: false, message: t('errorAlreadyReviewed') };

  // NOTE: photo_urls requires migration 0029. Until it is applied the
  // insert below fails closed (review rejected) rather than dropping photos.
  const { error } = await supabase.from('reviews').insert({
    booking_id: booking.id,
    reviewer_id: userId,
    provider_id: booking.provider_id,
    rating,
    text: text || null,
    photo_urls: photoUrls,
  });
  if (error) return { ok: false, message: t('errorGeneric') };

  const { data: prov } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', booking.provider_id)
    .single();
  if (prov) {
    await notify(supabase, {
      userId: prov.user_id,
      type: 'review_received',
      titleKey: 'reviewReceivedTitle',
      bodyKey: 'reviewReceivedBody',
      bodyArgs: { listing: booking.listings.title, rating: String(rating) },
      link: '/app/provider/bookings',
    });
  }

  redirect(localizedPath(bookingLink(booking.id), locale));
}

/** Mark one of the caller's own notifications as read. */
export async function markNotificationRead(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const id = str(formData, 'id');
  const session = await requireUser(await bookingT(locale));
  if (!session.ok) return;
  const { supabase, userId } = session;
  if (id) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', userId);
  }
  revalidatePath(localizedPath('/app/notifications', locale));
}

/** Mark all of the caller's notifications as read. */
export async function markAllNotificationsRead(
  formData: FormData
): Promise<void> {
  const locale = localeOf(formData);
  const session = await requireUser(await bookingT(locale));
  if (!session.ok) return;
  const { supabase, userId } = session;
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  revalidatePath(localizedPath('/app/notifications', locale));
}
