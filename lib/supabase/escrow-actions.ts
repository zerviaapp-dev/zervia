'use server';

import { revalidatePath } from 'next/cache';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { createAdminClient } from './admin';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import type { ActionResult } from './actions';

/**
 * Escrow server actions — held-payment lifecycle.
 *
 * TEST MODE ONLY until FINTRAC/MSB legal review clears live money
 * movement. All Stripe calls use the test secret key; no real charges.
 *
 * Money-safety rules:
 * - Release/refund/dispute-resolution are ADMIN ONLY (checked server-side).
 * - Rework requests are customer-only, within 48h of completion.
 * - Every Stripe call is followed by a DB write via the service-role
 *   client (RLS blocks app users from writing escrow rows).
 */

type EscrowRow = {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string | null;
  status: 'held' | 'released' | 'refunded' | 'disputed';
};

async function adminSession(): Promise<
  | { ok: false; message: string }
  | { ok: true; admin: NonNullable<ReturnType<typeof createAdminClient>> }
> {
  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return { ok: false, message: 'Payments are not configured yet.' };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: 'Payments are not configured yet.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase!.auth.getUser();
  if (!user) return { ok: false, message: 'Session expired. Please sign in again.' };
  const { data: profile } = await supabase!
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    return { ok: false, message: 'Only admins can do that.' };
  }
  return { ok: true, admin };
}

async function getEscrow(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  bookingId: string
): Promise<EscrowRow | null> {
  const { data } = await admin
    .from('escrow_payments')
    .select('id, booking_id, customer_id, provider_id, stripe_payment_intent_id, amount_cents, currency, status')
    .eq('booking_id', bookingId)
    .maybeSingle();
  return (data as EscrowRow | null) ?? null;
}

function revalidateBooking(locale: string, bookingId: string) {
  revalidatePath(`/${locale}/app/bookings/${bookingId}`);
  revalidatePath(`/${locale}/app/admin/bookings`);
}

/** Capture the authorized PaymentIntent (manual-capture hold) if needed. */
async function captureIfHeld(row: EscrowRow): Promise<void> {
  if (!row.stripe_payment_intent_id) return;
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
  // Only capture when Stripe is still waiting on us; already-captured or
  // auto-released intents are left alone.
  if (pi.status === 'requires_capture') {
    await stripe.paymentIntents.capture(row.stripe_payment_intent_id);
  }
}

/**
 * Release a held escrow to the provider (admin only).
 * Used for manual release and for dispute resolution in the provider's favour.
 */
export async function releaseEscrow(
  bookingId: string,
  locale: string = defaultLocale
): Promise<ActionResult> {
  const s = await adminSession();
  if (!s.ok) return s;
  const row = await getEscrow(s.admin, bookingId);
  if (!row || row.status !== 'held') {
    return { ok: false, message: 'No held payment found for this booking.' };
  }
  try {
    await captureIfHeld(row);
  } catch (err) {
    console.error('[escrow] capture failed', bookingId, err);
    return { ok: false, message: 'Payment capture failed. Please try again.' };
  }
  await s.admin
    .from('escrow_payments')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', row.id);
  await s.admin.from('transactions').insert({
    user_id: row.customer_id,
    provider_id: row.provider_id,
    stripe_payment_intent_id: row.stripe_payment_intent_id,
    amount_cents: row.amount_cents,
    currency: row.currency ?? 'cad',
    type: 'escrow',
    status: 'succeeded',
    description: 'Escrow released to provider (TEST MODE)',
  });
  revalidateBooking(locale, bookingId);
  return { ok: true, message: 'Payment released to the provider.' };
}

/**
 * Refund a held escrow to the customer (admin only).
 * Used for cancellations and dispute resolution in the customer's favour.
 */
export async function refundEscrow(
  bookingId: string,
  locale: string = defaultLocale
): Promise<ActionResult> {
  const s = await adminSession();
  if (!s.ok) return s;
  const row = await getEscrow(s.admin, bookingId);
  if (!row || !['held', 'disputed'].includes(row.status)) {
    return { ok: false, message: 'No refundable payment found for this booking.' };
  }
  try {
    if (row.stripe_payment_intent_id) {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      if (pi.status === 'requires_capture') {
        // Never captured: cancel the authorization instead of refunding.
        await stripe.paymentIntents.cancel(row.stripe_payment_intent_id);
      } else {
        await stripe.refunds.create({ payment_intent: row.stripe_payment_intent_id });
      }
    }
  } catch (err) {
    console.error('[escrow] refund failed', bookingId, err);
    return { ok: false, message: 'Refund failed. Please try again.' };
  }
  await s.admin
    .from('escrow_payments')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('id', row.id);
  await s.admin.from('transactions').insert({
    user_id: row.customer_id,
    provider_id: row.provider_id,
    stripe_payment_intent_id: row.stripe_payment_intent_id,
    amount_cents: row.amount_cents,
    currency: row.currency ?? 'cad',
    type: 'refund',
    status: 'refunded',
    description: 'Escrow refunded to customer (TEST MODE)',
  });
  revalidateBooking(locale, bookingId);
  return { ok: true, message: 'Payment refunded to the customer.' };
}

/**
 * Resolve a disputed booking (admin only). Outcome 'release' closes the
 * booking as completed and captures the held payment for the provider;
 * outcome 'refund' closes it as cancelled and refunds the customer.
 * The migration-0021 transition rule allows admins to move bookings out
 * of 'disputed' this way.
 */
export async function resolveDispute(
  bookingId: string,
  outcome: 'release' | 'refund',
  locale: string = defaultLocale
): Promise<ActionResult> {
  const s = await adminSession();
  if (!s.ok) return s;

  const { data: booking } = await s.admin
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking || (booking as { status: string }).status !== 'disputed') {
    return { ok: false, message: 'This booking is not disputed.' };
  }

  const money =
    outcome === 'release'
      ? await releaseEscrow(bookingId, locale)
      : await refundEscrow(bookingId, locale);
  if (!money.ok) return money;

  const now = new Date().toISOString();
  const { error } = await s.admin
    .from('bookings')
    .update({
      status: outcome === 'release' ? 'completed' : 'cancelled',
      dispute_resolved_at: now,
      dispute_outcome:
        outcome === 'release' ? 'released_to_provider' : 'refunded_to_customer',
    })
    .eq('id', bookingId);
  if (error) {
    console.error('[escrow] dispute close failed', bookingId, error.message);
    return { ok: false, message: 'Payment moved, but closing the booking failed.' };
  }
  revalidateBooking(locale, bookingId);
  return {
    ok: true,
    message:
      outcome === 'release'
        ? 'Dispute resolved: payment released to the provider.'
        : 'Dispute resolved: payment refunded to the customer.',
  };
}

/**
 * Auto-release a held escrow when its booking completes. Called from the
 * booking status flow — never throws, so a Stripe hiccup can never break
 * the completion itself. An admin can always release manually later.
 * Not a server action: an internal helper using the service-role client.
 */
export async function autoReleaseEscrow(bookingId: string): Promise<void> {
  try {
    if (!isStripeConfigured()) return;
    const admin = createAdminClient();
    if (!admin) return;
    const row = await getEscrow(admin, bookingId);
    if (!row || row.status !== 'held') return;
    await captureIfHeld(row);
    await admin
      .from('escrow_payments')
      .update({ status: 'released', released_at: new Date().toISOString() })
      .eq('id', row.id);
    await admin.from('transactions').insert({
      user_id: row.customer_id,
      provider_id: row.provider_id,
      stripe_payment_intent_id: row.stripe_payment_intent_id,
      amount_cents: row.amount_cents,
      currency: row.currency ?? 'cad',
      type: 'escrow',
      status: 'succeeded',
      description: 'Escrow auto-released on completion (TEST MODE)',
    });
  } catch (err) {
    console.error('[escrow] auto-release failed', bookingId, err);
  }
}

/**
 * Customer requests rework within 48 hours of completion.
 * The booking stays 'completed' (terminal states never reopen);
 * the request is a flag the provider sees on the booking.
 */
export async function requestRework(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = String(formData.get('locale') ?? defaultLocale);
  const bookingId = String(formData.get('bookingId') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  if (!bookingId) return { ok: false, message: 'Missing booking.' };
  if (notes.length > 2000) return { ok: false, message: 'Notes are too long.' };
  if (!isSupabaseConfigured()) return { ok: false, message: 'Not configured.' };

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Session expired. Please sign in again.' };

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_id, status, completed_at, rework_requested_at')
    .eq('id', bookingId)
    .maybeSingle();
  const b = booking as {
    id: string;
    customer_id: string;
    status: string;
    completed_at: string | null;
    rework_requested_at: string | null;
  } | null;
  if (!b || b.customer_id !== user.id) {
    return { ok: false, message: 'Booking not found.' };
  }
  if (b.status !== 'completed') {
    return { ok: false, message: 'Rework can only be requested on completed jobs.' };
  }
  if (b.rework_requested_at) {
    return { ok: false, message: 'Rework was already requested for this job.' };
  }
  // 48-hour window. completed_at may be null on older rows — fall back to now.
  const completedAt = b.completed_at ? new Date(b.completed_at).getTime() : Date.now();
  if (Date.now() - completedAt > 48 * 60 * 60 * 1000) {
    return { ok: false, message: 'The 48-hour rework window has closed.' };
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      rework_requested_at: new Date().toISOString(),
      rework_notes: notes || null,
    })
    .eq('id', bookingId);
  if (error) return { ok: false, message: 'Could not submit the rework request.' };

  revalidatePath(`/${locale}/app/bookings/${bookingId}`);
  return { ok: true, message: 'Rework requested. The provider has been notified.' };
}
