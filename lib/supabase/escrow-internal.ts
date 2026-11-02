/**
 * Internal escrow settlement helpers — NOT server actions.
 *
 * This module deliberately has NO 'use server' directive.
 * refundEscrowOnCancel / autoReleaseEscrow move money through the
 * service-role client on a bare bookingId, so they must never be
 * directly invocable as server actions (P1-1, Nov 1, 2026: they lived
 * in the 'use server' module lib/supabase/escrow-actions.ts, where
 * Next.js exposed every exported function as a remote-callable action
 * endpoint — any client could trigger a Stripe refund or escrow
 * release on any held escrow by bookingId).
 *
 * They are only ever called internally from the properly-gated
 * setBookingStatus flow in lib/supabase/booking-actions.ts, which
 * performs the caller-auth, booking-ownership, and status-transition
 * checks BEFORE these run. Both helpers are additionally defensive:
 * they no-op unless the escrow row is still 'held', and they never
 * throw (a Stripe hiccup must not break the booking transition).
 *
 * Do NOT add 'use server' here, and do NOT re-export these from
 * escrow-actions.ts.
 */

import { getStripe, isStripeConfigured, isStripeTestMode } from '@/lib/stripe';
import { createAdminClient } from './admin';

export type EscrowRow = {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string | null;
  status: 'held' | 'released' | 'refunded' | 'disputed';
};

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export async function getEscrow(
  admin: Admin,
  bookingId: string
): Promise<EscrowRow | null> {
  const { data } = await admin
    .from('escrow_payments')
    .select('id, booking_id, customer_id, provider_id, stripe_payment_intent_id, amount_cents, currency, status')
    .eq('booking_id', bookingId)
    .maybeSingle();
  return (data as EscrowRow | null) ?? null;
}

/** Capture the authorized PaymentIntent (manual-capture hold) if needed. */
export async function captureIfHeld(row: EscrowRow): Promise<void> {
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
 * Refund a held escrow when a booking is cancelled (internal, never throws).
 * Called from setBookingStatus on 'cancelled'. The job didn't happen, so the
 * customer's money goes back automatically — no admin action needed.
 * Uses the admin client internally (same pattern as autoReleaseEscrow).
 */
export async function refundEscrowOnCancel(bookingId: string): Promise<void> {
  try {
    if (!isStripeConfigured()) return;
    const admin = createAdminClient();
    if (!admin) return;
    const row = await getEscrow(admin, bookingId);
    if (!row || row.status !== 'held') return;
    try {
      if (row.stripe_payment_intent_id) {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(
          row.stripe_payment_intent_id
        );
        if (pi.status === 'requires_capture') {
          // Never captured: cancel the authorization instead of refunding.
          await stripe.paymentIntents.cancel(row.stripe_payment_intent_id);
        } else {
          await stripe.refunds.create({
            payment_intent: row.stripe_payment_intent_id,
          });
        }
      }
    } catch (err) {
      console.error('[escrow] auto-refund on cancel failed', bookingId, err);
      return;
    }
    await admin
      .from('escrow_payments')
      .update({ status: 'refunded', refunded_at: new Date().toISOString() })
      .eq('id', row.id);
    await admin.from('transactions').insert({
      user_id: row.customer_id,
      provider_id: row.provider_id,
      stripe_payment_intent_id: row.stripe_payment_intent_id,
      amount_cents: row.amount_cents,
      currency: row.currency ?? 'cad',
      type: 'refund',
      status: 'refunded',
      description: isStripeTestMode()
        ? 'Escrow auto-refunded on cancellation (TEST MODE)'
        : 'Escrow auto-refunded on cancellation',
    });
    console.log(
      '[escrow] auto-refunded on cancel',
      bookingId,
      `${row.amount_cents} ${row.currency ?? 'cad'}`
    );
  } catch (err) {
    console.error('[escrow] refundEscrowOnCancel threw', bookingId, err);
  }
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
      description: isStripeTestMode()
        ? 'Escrow auto-released on completion (TEST MODE)'
        : 'Escrow auto-released on completion',
    });
  } catch (err) {
    console.error('[escrow] auto-release failed', bookingId, err);
  }
}
