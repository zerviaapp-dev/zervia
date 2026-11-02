import {
  GUARANTEE_CLAIM_WINDOW_HOURS,
  isGuaranteeCategory,
} from '@/lib/guarantee';
import type { SupabaseClient } from '@supabase/supabase-js';

export type GuaranteeEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

type BookingRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  status: string;
  completed_at: string | null;
  agreed_price_cents: number | null;
  listings: { category: string } | null;
};

/**
 * Server-side guarantee eligibility check. Never trust the client.
 *
 * Rules (all must hold):
 *  1. Booking exists, belongs to the customer, status = 'completed'.
 *  2. Booking's listing category is a covered guarantee category.
 *  3. It is the customer's FIRST completed booking with this provider
 *     (any category — repeat customers already know what to expect).
 *  4. No prior pending/approved claim by this customer in this category
 *     (one claim per customer per category, lifetime).
 *  5. Within 48 hours of completed_at.
 *  6. No existing claim on this exact booking (unique constraint backstop).
 */
export async function checkGuaranteeEligibility(
  supabase: SupabaseClient,
  bookingId: string,
  customerId: string
): Promise<GuaranteeEligibility> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, provider_id, status, completed_at, agreed_price_cents, listings(category)'
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { eligible: false, reason: 'booking_not_found' };
  }
  const b = booking as unknown as BookingRow;
  if (b.customer_id !== customerId) {
    return { eligible: false, reason: 'not_your_booking' };
  }
  if (b.status !== 'completed') {
    return { eligible: false, reason: 'booking_not_completed' };
  }

  const category = b.listings?.category ?? '';
  if (!isGuaranteeCategory(category)) {
    return { eligible: false, reason: 'category_not_covered' };
  }

  // Rule 3: first completed booking with this provider?
  const { count: priorWithProvider, error: e1 } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('provider_id', b.provider_id)
    .eq('status', 'completed')
    .neq('id', bookingId);
  if (e1) {
    return { eligible: false, reason: 'check_failed' };
  }
  if ((priorWithProvider ?? 0) > 0) {
    return { eligible: false, reason: 'not_first_session' };
  }

  // Rule 4: prior claim in this category?
  const { count: priorClaims, error: e2 } = await supabase
    .from('guarantee_claims')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('category', category)
    .in('status', ['pending', 'approved']);
  if (e2) {
    return { eligible: false, reason: 'check_failed' };
  }
  if ((priorClaims ?? 0) > 0) {
    return { eligible: false, reason: 'already_claimed_category' };
  }

  // Rule 6: claim already exists on this booking?
  const { count: existingClaim, error: e3 } = await supabase
    .from('guarantee_claims')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId);
  if (e3) {
    return { eligible: false, reason: 'check_failed' };
  }
  if ((existingClaim ?? 0) > 0) {
    return { eligible: false, reason: 'already_claimed_booking' };
  }

  // Rule 5: within the 48-hour window?
  if (!b.completed_at) {
    return { eligible: false, reason: 'not_completed_yet' };
  }
  const windowMs = GUARANTEE_CLAIM_WINDOW_HOURS * 60 * 60 * 1000;
  if (Date.now() - new Date(b.completed_at).getTime() > windowMs) {
    return { eligible: false, reason: 'window_expired' };
  }

  return { eligible: true };
}

/** Amount (cents) the customer paid for this booking — server truth. */
export async function getBookingRefundAmount(
  supabase: SupabaseClient,
  bookingId: string
): Promise<number | null> {
  const { data } = await supabase
    .from('escrow_payments')
    .select('amount_cents')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (data && typeof (data as { amount_cents: number }).amount_cents === 'number') {
    return (data as { amount_cents: number }).amount_cents;
  }
  const { data: booking } = await supabase
    .from('bookings')
    .select('agreed_price_cents')
    .eq('id', bookingId)
    .maybeSingle();
  return (
    (booking as { agreed_price_cents: number | null } | null)?.agreed_price_cents ??
    null
  );
}
