import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Stripe Connect payout helpers.
 *
 * Platform fee (Liz's approved model):
 * - Free (starter) providers: 10%
 * - Paid (pro/business) providers: 5%
 *
 * Payout flow: when escrow is released, the held PaymentIntent is
 * captured to the PLATFORM account, then a Transfer sends the provider's
 * share (minus platform fee) to their Connect Express account. Stripe
 * handles the actual bank payout on its own schedule.
 */

type PayoutResult =
  | { ok: true; transferId: string; payoutId: string; netCents: number; feeCents: number }
  | { ok: false; reason: string };

/** Platform fee in basis points by provider tier. */
function feeBasisPoints(tier: string): number {
  return tier === 'pro' || tier === 'business' ? 500 : 1000; // 5% or 10%
}

/**
 * Transfer the provider's share of a released escrow to their Connect
 * account. Called AFTER the PaymentIntent is captured. Idempotent per
 * escrow_payment_id: if a payout row already exists, it is returned
 * without creating a duplicate transfer.
 *
 * Returns { ok:false, reason:'no_connect_account' } when the provider
 * has not completed Connect onboarding — the caller should surface a
 * "set up payouts" prompt instead of failing the release.
 */
export async function payoutToProvider(
  escrowPaymentId: string
): Promise<PayoutResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: 'not_configured' };

  // Idempotency: never double-pay. Only non-failed payouts are
  // returned early — a failed payout must be retried, not reported
  // as success.
  const { data: existing } = await admin
    .from('payouts')
    .select('id, stripe_transfer_id, amount_cents, platform_fee_cents, status')
    .eq('escrow_payment_id', escrowPaymentId)
    .maybeSingle();
  const ex = existing as {
    id: string;
    stripe_transfer_id: string | null;
    amount_cents: number;
    platform_fee_cents: number;
    status: string;
  } | null;
  if (ex && ex.status !== 'failed') {
    return {
      ok: true,
      transferId: ex.stripe_transfer_id ?? '',
      payoutId: ex.id,
      netCents: ex.amount_cents,
      feeCents: ex.platform_fee_cents,
    };
  }
  // A failed payout row exists: claim it ATOMICALLY (delete only if still
  // 'failed') so two concurrent retries can't both proceed and create
  // duplicate Stripe transfers. Exactly one caller wins the delete; the
  // loser re-reads the current row for this escrow below.
  if (ex?.status === 'failed') {
    console.log('[payouts] retrying failed payout', ex.id, 'for escrow', escrowPaymentId);
    const { data: claimed } = await admin
      .from('payouts')
      .delete()
      .eq('id', ex.id)
      .eq('status', 'failed')
      .select('id');
    if (!claimed || claimed.length === 0) {
      // Another retry already claimed it — return the current state.
      const { data: current } = await admin
        .from('payouts')
        .select('id, stripe_transfer_id, amount_cents, platform_fee_cents, status')
        .eq('escrow_payment_id', escrowPaymentId)
        .maybeSingle();
      const cu = current as {
        id: string;
        stripe_transfer_id: string | null;
        amount_cents: number;
        platform_fee_cents: number;
        status: string;
      } | null;
      if (cu && cu.status !== 'failed') {
        return {
          ok: true,
          transferId: cu.stripe_transfer_id ?? '',
          payoutId: cu.id,
          netCents: cu.amount_cents,
          feeCents: cu.platform_fee_cents,
        };
      }
      return { ok: false, reason: 'retry_already_in_progress' };
    }
  }

  // Load the escrow row + provider Connect details.
  const { data: escrow } = await admin
    .from('escrow_payments')
    .select('id, booking_id, provider_id, amount_cents, currency, status')
    .eq('id', escrowPaymentId)
    .maybeSingle();
  const er = escrow as {
    id: string;
    booking_id: string;
    provider_id: string;
    amount_cents: number;
    currency: string;
    status: string;
  } | null;
  if (!er || er.status !== 'released') {
    return { ok: false, reason: 'escrow_not_released' };
  }

  const { data: provider } = await admin
    .from('providers')
    .select('id, subscription_tier, stripe_connect_account_id, stripe_connect_payouts_enabled')
    .eq('id', er.provider_id)
    .maybeSingle();
  const pr = provider as {
    id: string;
    subscription_tier: string;
    stripe_connect_account_id: string | null;
    stripe_connect_payouts_enabled: boolean;
  } | null;

  if (!pr?.stripe_connect_account_id || !pr.stripe_connect_payouts_enabled) {
    return { ok: false, reason: 'no_connect_account' };
  }

  const feeBps = feeBasisPoints(pr.subscription_tier ?? 'starter');
  const feeCents = Math.round((er.amount_cents * feeBps) / 10000);
  const netCents = er.amount_cents - feeCents;
  if (netCents <= 0) {
    return { ok: false, reason: 'amount_too_small' };
  }

  // Create the payout row first (pending), then the Stripe transfer.
  const { data: payoutRow, error: insertErr } = await admin
    .from('payouts')
    .insert({
      provider_id: pr.id,
      booking_id: er.booking_id,
      escrow_payment_id: er.id,
      amount_cents: netCents,
      platform_fee_cents: feeCents,
      currency: (er.currency ?? 'cad').toLowerCase(),
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr || !payoutRow) {
    console.error('[payouts] insert failed', insertErr?.message);
    return { ok: false, reason: 'db_insert_failed' };
  }
  const payoutId = (payoutRow as { id: string }).id;

  const stripe: Stripe = getStripe();
  try {
    // Idempotency key per payout attempt: a network retry of this exact
    // request can never create a second transfer for the same payout row.
    const transfer = await stripe.transfers.create(
      {
        amount: netCents,
        currency: (er.currency ?? 'cad').toLowerCase(),
        destination: pr.stripe_connect_account_id,
        metadata: {
          zervia_payout_id: payoutId,
          zervia_booking_id: er.booking_id,
          zervia_provider_id: pr.id,
          zervia_platform_fee_cents: String(feeCents),
        },
      },
      { idempotencyKey: `zervia-payout-${payoutId}` }
    );

    await admin
      .from('payouts')
      .update({ stripe_transfer_id: transfer.id, status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', payoutId);

    // Record the platform fee as a transaction for revenue reporting.
    await admin.from('transactions').insert({
      user_id: null,
      provider_id: pr.id,
      amount_cents: feeCents,
      currency: (er.currency ?? 'cad').toLowerCase(),
      type: 'platform_fee',
      status: 'succeeded',
      description: `Platform fee (${feeBps / 100}%) on booking ${er.booking_id}`,
    });

    return { ok: true, transferId: transfer.id, payoutId, netCents, feeCents };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[payouts] transfer failed', payoutId, msg);
    await admin
      .from('payouts')
      .update({ status: 'failed', failure_reason: msg.slice(0, 500) })
      .eq('id', payoutId);
    return { ok: false, reason: 'transfer_failed' };
  }
}
