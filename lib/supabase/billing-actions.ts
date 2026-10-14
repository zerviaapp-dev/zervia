'use server';

import { getTranslations } from 'next-intl/server';
import { createClient } from './server';
import { getStripe } from '@/lib/stripe';
import { currencyForCountry } from '@/lib/currency';
import {
  BOOST_DAYS,
  LEAD_FEE_COLLECTION_ENABLED,
  isTestMode,
} from '@/lib/pricing';
import type { ActionResult } from './actions';


export type ProviderBillingRow = {
  id: string;
  business_name: string;
  status: string;
  subscription_tier: string;
  completed_jobs: number;
  country: string | null;
  verification_badge: boolean | null;
  spotlight_until: string | null;
};

export type SubscriptionRow = {
  id: string;
  tier: string;
  billing_interval: string;
  status: string;
  current_period_end: string | null;
  stripe_subscription_id: string;
};

export type TransactionRow = {
  id: string;
  amount_cents: number;
  currency: string;
  type: string;
  status: string;
  description: string | null;
  created_at: string;
};

type Ctx = {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  userId: string;
};

async function authed(): Promise<Ctx | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function billingT(locale: string) {
  return getTranslations({ locale, namespace: 'Billing' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : 'en';
}

/** The caller's provider row (approved or pending — billing is theirs either way). */
export async function getMyProvider(): Promise<ProviderBillingRow | null> {
  const ctx = await authed();
  if (!ctx) return null;
  const { data } = await ctx.supabase
    .from('providers')
    .select('id, business_name, status, subscription_tier, completed_jobs, country, verification_badge, spotlight_until')
    .eq('user_id', ctx.userId)
    .single();
  return (data as ProviderBillingRow | null) ?? null;
}

/** Local mirror of the provider's Stripe subscription (null = none). */
export async function getSubscription(): Promise<SubscriptionRow | null> {
  const ctx = await authed();
  if (!ctx) return null;
  const provider = await getMyProvider();
  if (!provider) return null;
  const { data } = await ctx.supabase
    .from('subscriptions')
    .select(
      'id, tier, billing_interval, status, current_period_end, stripe_subscription_id'
    )
    .eq('provider_id', provider.id)
    .single();
  return (data as SubscriptionRow | null) ?? null;
}

/** Newest-first money history for the caller. */
export async function getTransactions(limit = 50): Promise<TransactionRow[]> {
  const ctx = await authed();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from('transactions')
    .select('id, amount_cents, currency, type, status, description, created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as TransactionRow[] | null) ?? [];
}

/**
 * Accrued (not yet collected) lead fees: SUM of lead_fee_cents over the
 * caller's bookings in confirmed/completed status. During the free
 * founding period this is 0 — shown for transparency, never charged.
 */
export async function getLeadFeesAccrued(): Promise<number> {
  const ctx = await authed();
  if (!ctx) return 0;
  const provider = await getMyProvider();
  if (!provider) return 0;
  const { data } = await ctx.supabase
    .from('bookings')
    .select('lead_fee_cents')
    .eq('provider_id', provider.id)
    .in('status', ['confirmed', 'completed']);
  if (!data) return 0;
  return data.reduce((sum, r) => sum + (Number(r.lead_fee_cents) || 0), 0);
}

/**
 * Activate a 7-day featured boost on one of the caller's own listings.
 * Used by the points-redemption path (Phase 4) and the $9 Stripe path
 * (webhook calls the same logic via service role). Ownership is checked
 * here; RLS enforces it again at the database.
 */
export async function activateBoost(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await billingT(locale);
  const ctx = await authed();
  if (!ctx) return { ok: false, message: t('errorSessionExpired') };

  const listingId = String(formData.get('listingId') ?? '').trim();
  if (!listingId) return { ok: false, message: t('boostChooseListing') };

  const { data: listing } = await ctx.supabase
    .from('listings')
    .select('id, providers!inner(user_id)')
    .eq('id', listingId)
    .single();
  if (!listing) return { ok: false, message: t('errorGeneric') };

  const until = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await ctx.supabase
    .from('listings')
    .update({ is_featured: true, featured_until: until })
    .eq('id', listingId);
  if (error) return { ok: false, message: t('errorGeneric') };
  return { ok: true, message: t('boostActivated') };
}

/**
 * Collect accrued lead fees via a Stripe invoice. HARD-GATED: returns a
 * "not enabled" message unless the founder flips LEAD_FEE_COLLECTION_ENABLED
 * in lib/pricing.ts AND Stripe is configured. Test-mode only until she
 * approves real charges — the code refuses live mode silently.
 */
export async function createLeadFeeInvoice(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await billingT(locale);

  if (!LEAD_FEE_COLLECTION_ENABLED) {
    return { ok: false, message: t('leadFeesNotEnabled') };
  }
  if (!isTestMode()) {
    // Real-money invoicing needs an explicit second approval step.
    return { ok: false, message: t('leadFeesNotEnabled') };
  }

  const ctx = await authed();
  if (!ctx) return { ok: false, message: t('errorSessionExpired') };
  const provider = await getMyProvider();
  if (!provider) return { ok: false, message: t('errorGeneric') };

  const amount = await getLeadFeesAccrued();
  if (amount <= 0) return { ok: false, message: t('leadFeesNoneAccrued') };

  const stripe = getStripe();
  // Reuse the subscription's Stripe customer when one exists.
  const { data: subRow } = await ctx.supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('provider_id', provider.id)
    .single();

  try {
    const customer =
      subRow?.stripe_customer_id ??
      (
        await stripe.customers.create({
          metadata: { zervia_user_id: ctx.userId, zervia_provider_id: provider.id },
        })
      ).id;

    await stripe.invoiceItems.create({
      customer,
      amount,
      currency: currencyForCountry(provider.country),
      description: 'Zervia lead fees',
      metadata: { zervia_user_id: ctx.userId, zervia_provider_id: provider.id },
    });
    const invoice = await stripe.invoices.create({
      customer,
      auto_advance: true,
      metadata: { zervia_user_id: ctx.userId, zervia_provider_id: provider.id },
    });
    await stripe.invoices.finalizeInvoice(invoice.id);
    return { ok: true, message: t('leadFeeInvoiceCreated') };
  } catch {
    return { ok: false, message: t('errorGeneric') };
  }
}
