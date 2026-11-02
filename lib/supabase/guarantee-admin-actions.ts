'use server';

import { revalidatePath } from 'next/cache';
import { createClient, isSupabaseConfigured } from './server';
import { createAdminClient } from './admin';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { defaultLocale } from '@/lib/locales';
import { getBookingRefundAmount } from './guarantee-actions';
import type { ActionResult } from './actions';

/**
 * Guarantee claim review — admin only.
 *
 * Approve: refunds the customer IN FULL from Zervia operating funds
 * (Stripe platform balance). The provider's payout is NEVER clawed back:
 * payouts are separate Stripe transfers, and a refund on the platform
 * charge does not reverse them.
 *
 * Idempotency: the Stripe refund uses idempotency key
 * `guarantee-claim-<claimId>`, and the claim row is flipped
 * pending -> approved atomically, so double-clicks and two-admin
 * races cannot double-refund.
 */

async function requireAdmin() {
  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return { ok: false as const, message: 'Payments are not configured yet.' };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false as const, message: 'Payments are not configured yet.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase!.auth.getUser();
  if (!user) return { ok: false as const, message: 'Session expired. Please sign in again.' };
  const { data: profile } = await supabase!
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== 'admin') {
    return { ok: false as const, message: 'Only admins can do that.' };
  }
  return { ok: true as const, admin, adminId: (profile as { id: string }).id };
}

type ClaimRow = {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  category: string;
  reason: string;
  status: string;
};

export async function approveGuaranteeClaim(
  claimId: string,
  locale: string = defaultLocale
): Promise<ActionResult> {
  const s = await requireAdmin();
  if (!s.ok) return s;
  const { admin, adminId } = s;

  const { data: claimData } = await admin
    .from('guarantee_claims')
    .select('id, booking_id, customer_id, provider_id, category, reason, status')
    .eq('id', claimId)
    .maybeSingle();
  const claim = claimData as ClaimRow | null;
  if (!claim) return { ok: false, message: 'Claim not found.' };
  if (claim.status !== 'pending') {
    return { ok: false, message: `Claim is already ${claim.status}.` };
  }

  const expectedCents = await getBookingRefundAmount(admin, claim.booking_id);

  // Resolve the Stripe payment for this booking, if any.
  const { data: escrow } = await admin
    .from('escrow_payments')
    .select('stripe_payment_intent_id, currency')
    .eq('booking_id', claim.booking_id)
    .maybeSingle();
  const piId = (escrow as { stripe_payment_intent_id: string | null } | null)
    ?.stripe_payment_intent_id;
  const currency = (
    (escrow as { currency: string | null } | null)?.currency ?? 'cad'
  ).toLowerCase();

  let refundedCents: number | null = null;
  let stripeRefundId: string | null = null;
  let manualNote: string | null = null;

  if (piId && expectedCents != null && expectedCents > 0) {
    try {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status === 'requires_capture') {
        // Defensive: a completed booking should never still be held,
        // but if it is, cancel the hold instead of refunding.
        await stripe.paymentIntents.cancel(piId);
        manualNote = 'Authorization was still held — cancelled instead of refunded.';
      } else {
        // Idempotent: safe against double-clicks and two-admin races.
        // Payouts are separate transfers, so this refund comes from the
        // platform (operating) balance and does NOT claw back the provider.
        const refund = await stripe.refunds.create(
          { payment_intent: piId },
          { idempotencyKey: `guarantee-claim-${claimId}` }
        );
        stripeRefundId = refund.id;
      }
      refundedCents = expectedCents;
    } catch (err) {
      console.error('[guarantee] refund failed', claimId, err);
      return { ok: false, message: 'Stripe refund failed. Claim left pending — please try again.' };
    }
  } else {
    // No Stripe payment on record (e.g. legacy/test booking): approve the
    // claim but flag it for manual handling — never silently pretend
    // money moved.
    manualNote =
      'MANUAL REFUND REQUIRED — no Stripe payment found for this booking. Handle off-platform, then record the amount.';
    refundedCents = expectedCents;
  }

  const reviewNote = [
    manualNote,
    stripeRefundId ? `Stripe refund ${stripeRefundId}.` : null,
    'Provider payout left intact (Zervia operating funds).',
  ]
    .filter(Boolean)
    .join(' ');

  // Atomic flip: only succeeds if still pending — the race guard.
  const { data: updated } = await admin
    .from('guarantee_claims')
    .update({
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote,
      refund_cents: refundedCents,
    })
    .eq('id', claimId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (!updated) {
    return { ok: false, message: 'Claim was already handled by another admin.' };
  }

  // Audit trail — same ledger as escrow refunds, clearly labelled.
  if (refundedCents != null && refundedCents > 0) {
    await admin.from('transactions').insert({
      user_id: claim.customer_id,
      provider_id: claim.provider_id,
      stripe_payment_intent_id: piId,
      amount_cents: refundedCents,
      currency,
      type: 'refund',
      status: 'refunded',
      description: `First-Session Guarantee refund (claim ${claimId}) — Zervia operating funds, provider paid in full`,
    });
  }

  revalidatePath(`/${locale}/app/admin/guarantee`);
  return {
    ok: true,
    message: stripeRefundId
      ? 'Claim approved — customer refunded from Zervia operating funds.'
      : 'Claim approved — manual refund flagged (no Stripe payment found).',
  };
}

export async function rejectGuaranteeClaim(
  claimId: string,
  note: string,
  locale: string = defaultLocale
): Promise<ActionResult> {
  const s = await requireAdmin();
  if (!s.ok) return s;
  const { admin, adminId } = s;

  const cleanNote = note.trim();
  if (cleanNote.length < 3 || cleanNote.length > 2000) {
    return { ok: false, message: 'Please add a short internal note for the rejection.' };
  }

  const { data: updated } = await admin
    .from('guarantee_claims')
    .update({
      status: 'rejected',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      review_note: cleanNote,
    })
    .eq('id', claimId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (!updated) {
    return { ok: false, message: 'Claim was already handled by another admin.' };
  }

  revalidatePath(`/${locale}/app/admin/guarantee`);
  return { ok: true, message: 'Claim rejected.' };
}
