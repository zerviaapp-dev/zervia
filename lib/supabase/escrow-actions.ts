'use server';

import { revalidatePath } from 'next/cache';
import { getStripe, isStripeConfigured, isStripeTestMode } from '@/lib/stripe';
import { createAdminClient } from './admin';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import type { ActionResult } from './actions';
import { captureIfHeld, getEscrow } from './escrow-internal';

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
 * - refundEscrowOnCancel / autoReleaseEscrow live in ./escrow-internal
 *   (NO 'use server' there) and are called ONLY from the gated
 *   setBookingStatus flow — they must never be re-exported here, or
 *   Next.js would expose them as remote-callable action endpoints
 *   (P1-1, Nov 1, 2026).
 */

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

function revalidateBooking(locale: string, bookingId: string) {
  revalidatePath(`/${locale}/app/bookings/${bookingId}`);
  revalidatePath(`/${locale}/app/admin/bookings`);
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
    description: 'Escrow released to provider',
  });

  // Stripe Connect payout: transfer the provider's share (minus platform
  // fee) to their Connect Express account. Never throws — a payout hiccup
  // must not break the release itself; the payout row records the state
  // and an admin can retry from the payouts view.
  try {
    const { payoutToProvider } = await import('@/lib/stripe-connect');
    const payout = await payoutToProvider(row.id);
    if (!payout.ok && payout.reason === 'no_connect_account') {
      console.log(
        '[escrow] release ok, provider has no Connect account yet — payout pending onboarding',
        bookingId
      );
    } else if (!payout.ok) {
      console.error('[escrow] payout failed after release', bookingId, payout.reason);
    }
  } catch (err) {
    console.error('[escrow] payout threw after release', bookingId, err);
  }

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
    description: isStripeTestMode()
      ? 'Escrow refunded to customer (TEST MODE)'
      : 'Escrow refunded to customer',
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

/**
 * Retry a failed provider payout (admin only).
 * Only payouts with status='failed' can be retried. The retry atomically
 * claims the failed row (delete-if-still-failed) and attempts a fresh
 * Stripe transfer via payoutToProvider, which recreates the payout row on
 * success. Concurrent retries are safe: exactly one caller wins the claim.
 */
export async function retryPayout(
  payoutId: string,
  locale: string = defaultLocale
): Promise<ActionResult> {
  const s = await adminSession();
  if (!s.ok) return s;

  const { data: payout } = await s.admin
    .from('payouts')
    .select('id, escrow_payment_id, status')
    .eq('id', payoutId)
    .maybeSingle();
  const pr = payout as { id: string; escrow_payment_id: string; status: string } | null;
  if (!pr) return { ok: false, message: 'Payout not found.' };
  if (pr.status !== 'failed') {
    return { ok: false, message: 'Only failed payouts can be retried.' };
  }

  const { payoutToProvider } = await import('@/lib/stripe-connect');
  const result = await payoutToProvider(pr.escrow_payment_id);
  if (!result.ok) {
    return { ok: false, message: `Retry failed: ${result.reason}` };
  }
  revalidatePath(`/${locale}/app/admin/payouts`);
  return { ok: true, message: 'Payout retried successfully.' };
}
