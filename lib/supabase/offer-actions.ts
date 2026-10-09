'use server';

import { getTranslations } from 'next-intl/server';
import { createClient } from './server';
import type { ActionResult } from './actions';

export type { ActionResult };

export type OfferRow = {
  id: string;
  provider_id: string;
  title: string;
  description: string;
  reward_points: number;
  min_spend_cents: number;
  max_redemptions: number | null;
  redemption_count: number;
  status: 'active' | 'paused';
  starts_at: string;
  ends_at: string | null;
  business_name?: string;
  /** For the customer shelf: has the caller already loaded this offer? */
  loaded?: boolean;
};

export type ActivationRow = {
  id: string;
  offer_id: string;
  activated_at: string;
  redeemed_at: string | null;
  offer: OfferRow | null;
};

async function offersT(locale: string) {
  return getTranslations({ locale, namespace: 'Offers' });
}

async function authT(locale: string) {
  return getTranslations({ locale, namespace: 'Auth' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : 'en';
}

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

/** The caller's provider row, or null when they aren't a provider. */
async function ownProviderId(ctx: Ctx): Promise<string | null> {
  const { data } = await ctx.supabase
    .from('providers')
    .select('id')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

function toInt(raw: FormDataEntryValue | null, fallback = 0): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Provider creates an offer. Validates everything server-side; RLS
 * re-enforces ownership on insert.
 */
export async function createOffer(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await offersT(locale);
  const ta = await authT(locale);
  const ctx = await authed();
  if (!ctx) return { ok: false, message: ta('errorSessionExpired') };

  const providerId = await ownProviderId(ctx);
  if (!providerId) return { ok: false, message: t('notProvider') };

  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const rewardPoints = toInt(formData.get('rewardPoints'));
  // The form collects whole dollars for provider convenience; the ledger
  // stores cents.
  const minSpendCents = toInt(formData.get('minSpendDollars')) * 100;
  const maxRedemptionsRaw = String(formData.get('maxRedemptions') ?? '').trim();
  const maxRedemptions = maxRedemptionsRaw === '' ? null : toInt(maxRedemptionsRaw);
  const endsAtRaw = String(formData.get('endsAt') ?? '').trim();

  if (title.length < 3 || title.length > 80)
    return { ok: false, message: t('errorTitle') };
  if (description.length > 280) return { ok: false, message: t('errorDescription') };
  if (rewardPoints < 1 || rewardPoints > 100000)
    return { ok: false, message: t('errorReward') };
  if (minSpendCents < 0) return { ok: false, message: t('errorMinSpend') };
  if (maxRedemptions !== null && maxRedemptions < 1)
    return { ok: false, message: t('errorMaxRedemptions') };

  let endsAt: string | null = null;
  if (endsAtRaw) {
    const d = new Date(endsAtRaw);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now())
      return { ok: false, message: t('errorEndsAt') };
    endsAt = d.toISOString();
  }

  const { error } = await ctx.supabase.from('offers').insert({
    provider_id: providerId,
    title,
    description,
    reward_points: rewardPoints,
    min_spend_cents: minSpendCents,
    max_redemptions: maxRedemptions,
    ends_at: endsAt,
  });
  if (error) return { ok: false, message: ta('errorGeneric') };
  return { ok: true, message: t('offerCreated') };
}

/** Provider pauses or resumes one of their own offers. */
export async function setOfferStatus(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await offersT(locale);
  const ta = await authT(locale);
  const ctx = await authed();
  if (!ctx) return { ok: false, message: ta('errorSessionExpired') };

  const providerId = await ownProviderId(ctx);
  if (!providerId) return { ok: false, message: t('notProvider') };

  const offerId = String(formData.get('offerId') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (status !== 'active' && status !== 'paused')
    return { ok: false, message: ta('errorGeneric') };

  const { error } = await ctx.supabase
    .from('offers')
    .update({ status })
    .eq('id', offerId)
    .eq('provider_id', providerId);
  if (error) return { ok: false, message: ta('errorGeneric') };
  return {
    ok: true,
    message: status === 'active' ? t('offerResumed') : t('offerPaused'),
  };
}

/**
 * Customer "Load"s an offer (RBC-style). Idempotent: loading twice is a
 * no-op that still reports success.
 */
export async function activateOffer(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await offersT(locale);
  const ta = await authT(locale);
  const ctx = await authed();
  if (!ctx) return { ok: false, message: ta('errorSessionExpired') };

  const offerId = String(formData.get('offerId') ?? '').trim();
  if (!offerId) return { ok: false, message: ta('errorGeneric') };

  // Only currently-valid offers can be loaded.
  const { data: offer } = await ctx.supabase
    .from('offers')
    .select('id')
    .eq('id', offerId)
    .eq('status', 'active')
    .lte('starts_at', new Date().toISOString())
    .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
    .maybeSingle();
  if (!offer) return { ok: false, message: t('offerNotAvailable') };

  const { error } = await ctx.supabase.from('offer_activations').upsert(
    { offer_id: offerId, user_id: ctx.userId },
    { onConflict: 'offer_id,user_id', ignoreDuplicates: true }
  );
  if (error) return { ok: false, message: ta('errorGeneric') };
  return { ok: true, message: t('offerLoaded') };
}

/** Active offers for the customer shelf, with provider names + loaded flags. */
export async function getActiveOffers(): Promise<OfferRow[]> {
  const ctx = await authed();
  if (!ctx) return [];
  const now = new Date().toISOString();
  const { data } = await ctx.supabase
    .from('offers')
    .select(
      'id, provider_id, title, description, reward_points, min_spend_cents, max_redemptions, redemption_count, status, starts_at, ends_at, providers!inner(business_name)'
    )
    .eq('status', 'active')
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = ((data ?? []) as unknown as (Omit<
    OfferRow,
    'business_name' | 'loaded'
  > & {
    providers: { business_name: string };
  })[]);

  const { data: mine } = await ctx.supabase
    .from('offer_activations')
    .select('offer_id')
    .eq('user_id', ctx.userId);
  const loadedSet = new Set((mine ?? []).map((r: { offer_id: string }) => r.offer_id));

  return rows.map((r) => ({
    id: r.id,
    provider_id: r.provider_id,
    title: r.title,
    description: r.description,
    reward_points: r.reward_points,
    min_spend_cents: r.min_spend_cents,
    max_redemptions: r.max_redemptions,
    redemption_count: r.redemption_count,
    status: r.status,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    business_name: r.providers.business_name,
    loaded: loadedSet.has(r.id),
  }));
}

/** The caller's loaded offers (customer view). */
export async function getMyActivations(): Promise<ActivationRow[]> {
  const ctx = await authed();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from('offer_activations')
    .select(
      'id, offer_id, activated_at, redeemed_at, offers(id, provider_id, title, description, reward_points, min_spend_cents, status, ends_at, providers!inner(business_name))'
    )
    .eq('user_id', ctx.userId)
    .order('activated_at', { ascending: false })
    .limit(100);
  return ((data ?? []) as unknown as (Omit<ActivationRow, 'offer'> & {
    offers: OfferRow & { providers: { business_name: string } };
  })[]).map((r) => ({
    id: r.id,
    offer_id: r.offer_id,
    activated_at: r.activated_at,
    redeemed_at: r.redeemed_at,
    offer: r.offers
      ? {
          ...r.offers,
          business_name: r.offers.providers.business_name,
        }
      : null,
  }));
}

export type ProviderOfferStats = {
  offers: OfferRow[];
  /** Total marketing fees owed across all redemptions, in cents. */
  feesOwedCents: number;
  totalRedemptions: number;
};

/** Provider's own offers + redemption stats + fees owed. */
export async function getMyProviderOffers(): Promise<ProviderOfferStats | null> {
  const ctx = await authed();
  if (!ctx) return null;
  const providerId = await ownProviderId(ctx);
  if (!providerId) return null;

  const { data: offers } = await ctx.supabase
    .from('offers')
    .select(
      'id, provider_id, title, description, reward_points, min_spend_cents, max_redemptions, redemption_count, status, starts_at, ends_at'
    )
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });

  const { data: redemptions } = await ctx.supabase
    .from('offer_redemptions')
    .select('fee_cents')
    .eq('provider_id', providerId);

  const feesOwedCents = (redemptions ?? []).reduce(
    (sum: number, r: { fee_cents: number }) => sum + (r.fee_cents ?? 0),
    0
  );

  return {
    offers: (offers ?? []) as OfferRow[],
    feesOwedCents,
    totalRedemptions: (redemptions ?? []).length,
  };
}

/**
 * Called when a booking completes. Finds the customer's loaded-but-unredeemed
 * offers from this booking's provider and redeems each one atomically via
 * redeem_offer(). Never throws — a rewards hiccup must not break completion.
 */
export async function applyOfferRewards(bookingId: string): Promise<void> {
  try {
    const ctx = await authed();
    if (!ctx) return;

    const { data: booking } = (await ctx.supabase
      .from('bookings')
      .select('id, provider_id, customer_id, status')
      .eq('id', bookingId)
      .single()) as {
      data: {
        id: string;
        provider_id: string;
        customer_id: string;
        status: string;
      } | null;
    };
    if (!booking || booking.status !== 'completed') return;

    const { data: activations } = await ctx.supabase
      .from('offer_activations')
      .select('id, offer_id, offers!inner(provider_id, status)')
      .eq('user_id', booking.customer_id)
      .is('redeemed_at', null)
      .eq('offers.provider_id', booking.provider_id)
      .eq('offers.status', 'active');

    for (const a of (activations ?? []) as { id: string }[]) {
      try {
        await ctx.supabase.rpc('redeem_offer', {
          p_activation_id: a.id,
          p_booking_id: bookingId,
        });
      } catch {
        // Per-offer skip (e.g. min spend not met): never fail completion.
      }
    }
  } catch {
    // Never break booking completion because of offers.
  }
}
