'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale, locales } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import { isCategory, isSubcategory, isPriceType, isListingStatus } from '@/lib/categories';
import { PROVIDER_AGREEMENT_VERSION } from '@/lib/provider-agreement';
import {
  COMMUNITY_ALLOWED_CATEGORIES,
  checkCommunityCategory,
  checkCommunityGate,
  checkCommunityListingBasics,
  isProviderTier,
  resolveProviderTier,
  type ProviderTier,
} from '@/lib/provider-tiers';
import type { ActionResult } from './actions';

async function providerT(locale: string) {
  return getTranslations({ locale, namespace: 'Provider' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/** The caller's provider row id, or null when they have none. */
async function ownProviderId(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

/** The caller's provider tier; 'verified' when the 0052 column is absent. */
async function ownProviderTier(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string
): Promise<ProviderTier> {
  const withTier = await supabase
    .from('providers')
    .select('provider_tier')
    .eq('user_id', userId)
    .maybeSingle();
  if (withTier.error) {
    console.warn('[tiers] provider_tier read failed (migration 0052 pending?) — degrading to verified');
    return 'verified';
  }
  return resolveProviderTier(withTier.data as { provider_tier?: string | null } | null);
}

/**
 * Community listing gate shared by create/update/status actions.
 * Returns an error message key suffix or null when allowed.
 */
async function communityListingViolation(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  providerId: string,
  input: { category: string; subcategory: string; country: string; status: string; listingId?: string }
): Promise<'errorCommunityCategory' | 'errorCommunitySubcategory' | 'errorCommunityCountry' | 'errorCommunityCap' | 'errorCommunityLocation' | null> {
  const verdict = checkCommunityCategory(input.category, input.subcategory || null);
  if (!verdict.ok) {
    return verdict.reason === 'subcategory_banned'
      ? 'errorCommunitySubcategory'
      : 'errorCommunityCategory';
  }
  let activeCount = 0;
  if (input.status === 'active') {
    let q = supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('status', 'active');
    if (input.listingId) q = q.neq('id', input.listingId);
    const { count } = await q;
    activeCount = count ?? 0;
  }
  const basics = checkCommunityListingBasics({
    country: input.country,
    activating: input.status === 'active',
    activeListingCountExcludingThis: activeCount,
  });
  if (!basics.ok) {
    return basics.reason === 'country' ? 'errorCommunityCountry' : 'errorCommunityCap';
  }
  // GPS service-area gate (§7a): activation requires at least one
  // verified service area. If the table does not exist yet (migration
  // 0052 pending) the read errors and the gate is skipped — the same
  // degrade-safely rule as every other 0052 surface.
  if (input.status === 'active') {
    const { count, error } = await supabase
      .from('community_service_areas')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId);
    if (!error && (count ?? 0) === 0) return 'errorCommunityLocation';
  }
  return null;
}

type ValidatedProvider = {
  businessName: string;
  category: string;
  description: string;
  country: string;
  city: string;
  phone: string;
  whatsapp: string;
  languages: string[];
};

async function validateProvider(
  formData: FormData,
  t: Awaited<ReturnType<typeof providerT>>
): Promise<{ ok: true; value: ValidatedProvider } | { ok: false; message: string }> {
  const businessName = str(formData, 'businessName');
  const category = str(formData, 'category');
  const description = str(formData, 'businessDescription');
  const country = str(formData, 'country');
  const city = str(formData, 'city');
  const phone = str(formData, 'phone');
  const whatsapp = str(formData, 'whatsapp');
  const languages = formData
    .getAll('languages')
    .map((v) => String(v))
    .filter((v) => (locales as readonly string[]).includes(v));

  if (businessName.length < 2 || businessName.length > 120)
    return { ok: false, message: t('errorBusinessName') };
  if (!isCategory(category)) return { ok: false, message: t('errorCategory') };
  if (!country) return { ok: false, message: t('errorCountry') };
  if (description.length > 2000)
    return { ok: false, message: t('errorDescriptionTooLong') };

  return {
    ok: true,
    value: {
      businessName,
      category,
      description,
      country,
      city,
      phone,
      whatsapp,
      languages,
    },
  };
}

type ValidatedListing = {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  priceCents: number | null;
  priceType: string;
  country: string;
  city: string;
  status: string;
  photos: string[];
  /** Optional map pin (migration 0032_listing_coordinates). */
  latitude: number | null;
  longitude: number | null;
};

/**
 * Parses an optional coordinate from form data. Returns null for missing,
 * empty, or out-of-range values — coordinates are always optional, so an
 * invalid pin is dropped rather than failing the whole submission.
 */
function parseCoord(raw: string, min: number, max: number): number | null {
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

type SupabaseSessionClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/**
 * PostgREST "undefined column" code. Listing writes include latitude/longitude
 * once migration 0032_listing_coordinates is applied; until then the column
 * is unknown and the write must be retried without coordinates so listing
 * creation/updates never break.
 */
const UNDEFINED_COLUMN = '42703';

function isMissingColumnError(error: { code?: string } | null): boolean {
  return !!error && error.code === UNDEFINED_COLUMN;
}

/** Insert a listing row, retrying without coordinates if the columns are missing. */
async function insertListingRow(
  supabase: SupabaseSessionClient,
  row: Record<string, unknown>
): Promise<{ error: { code?: string; message: string } | null }> {
  const first = await supabase.from('listings').insert(row);
  if (isMissingColumnError(first.error)) {
    const { latitude: _lat, longitude: _lng, ...rest } = row;
    return supabase.from('listings').insert(rest);
  }
  return first;
}

/** Update a listing row, retrying without coordinates if the columns are missing. */
async function updateListingRow(
  supabase: SupabaseSessionClient,
  row: Record<string, unknown>,
  listingId: string,
  providerId: string
): Promise<{ error: { code?: string; message: string } | null }> {
  const first = await supabase
    .from('listings')
    .update(row)
    .eq('id', listingId)
    .eq('provider_id', providerId);
  if (isMissingColumnError(first.error)) {
    const { latitude: _lat, longitude: _lng, ...rest } = row;
    return supabase
      .from('listings')
      .update(rest)
      .eq('id', listingId)
      .eq('provider_id', providerId);
  }
  return first;
}

/**
 * Validate the photos JSON from the PhotoUploader hidden input.
 * Only https URLs are accepted, max 5, each ≤ 500 chars — the uploader
 * writes these URLs itself, so this is a tamper check, not UX.
 */
function validatePhotos(raw: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  if (parsed.length > 5) return null;
  const urls: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') return null;
    if (!item.startsWith('https://')) return null;
    if (item.length > 500) return null;
    urls.push(item);
  }
  return urls;
}

async function validateListing(
  formData: FormData,
  t: Awaited<ReturnType<typeof providerT>>
): Promise<{ ok: true; value: ValidatedListing } | { ok: false; message: string }> {
  const title = str(formData, 'title');
  const description = str(formData, 'description');
  const category = str(formData, 'category');
  const subcategory = str(formData, 'subcategory');
  const priceRaw = str(formData, 'price');
  const priceType = str(formData, 'priceType') || 'quote';
  const country = str(formData, 'country');
  const city = str(formData, 'city');
  const status = str(formData, 'status') || 'draft';
  // Optional map pin from the LocationPicker (hidden latitude/longitude inputs).
  const latitude = parseCoord(str(formData, 'latitude'), -90, 90);
  const longitude = parseCoord(str(formData, 'longitude'), -180, 180);

  if (title.length < 3 || title.length > 120)
    return { ok: false, message: t('errorTitle') };
  if (!isCategory(category)) return { ok: false, message: t('errorCategory') };
  if (subcategory !== '' && !isSubcategory(category, subcategory))
    return { ok: false, message: t('errorSubcategory') };
  if (!isPriceType(priceType))
    return { ok: false, message: t('errorPriceType') };
  if (!isListingStatus(status))
    return { ok: false, message: t('errorStatus') };
  if (!country) return { ok: false, message: t('errorCountry') };
  if (description.length > 2000)
    return { ok: false, message: t('errorDescriptionTooLong') };

  let priceCents: number | null = null;
  if (priceRaw !== '') {
    // Accept "49.99" or "49" — money is stored as integer cents, never floats.
    if (!/^\d+(\.\d{1,2})?$/.test(priceRaw))
      return { ok: false, message: t('errorPrice') };
    priceCents = Math.round(parseFloat(priceRaw) * 100);
    if (!Number.isSafeInteger(priceCents) || priceCents < 0)
      return { ok: false, message: t('errorPrice') };
  }
  if (priceCents === null && priceType !== 'quote')
    return { ok: false, message: t('errorPriceRequired') };

  const photos = validatePhotos(str(formData, 'photos'));
  if (photos === null) return { ok: false, message: t('errorPhotos') };

  return {
    ok: true,
    value: {
      title,
      description,
      category,
      subcategory,
      priceCents,
      priceType,
      country,
      city,
      status,
      photos,
      latitude,
      longitude,
    },
  };
}

async function requireUser(
  t: Awaited<ReturnType<typeof providerT>>
): Promise<
  | { ok: false; message: string }
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
      userId: string;
      emailConfirmedAt: string | null;
    }
> {
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };
  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSessionExpired') };
  return {
    ok: true,
    supabase,
    userId: user.id,
    emailConfirmedAt: user.email_confirmed_at ?? null,
  };
}

/**
 * Provider onboarding: creates a `pending` provider row plus the provider's
 * first listing as a `draft`. An admin approves the provider in the queue;
 * only then do active listings become publicly visible.
 */
export async function submitOnboarding(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  // Wrap everything in try/catch — an unhandled throw in a server action
  // used with useActionState causes "Application error: client-side exception".
  // Always return a result object, never throw.
  try {
    return await submitOnboardingInner(_prev, formData);
  } catch (e) {
    console.error('[onboarding] Unhandled submit error:', e);
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }
}

async function submitOnboardingInner(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await providerT(locale);

  const validated = await validateProvider(formData, t);
  if (!validated.ok) return { ok: false, message: validated.message };
  const listingValidated = await validateListing(formData, t);
  if (!listingValidated.ok)
    return { ok: false, message: listingValidated.message };

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  if (await ownProviderId(supabase, userId))
    return { ok: false, message: t('errorAlreadyProvider') };

  const p = validated.value;
  const l = listingValidated.value;

  // Provider Agreement must be accepted (checkbox on the review step).
  // The client disables submit until checked; the server enforces it.
  if (str(formData, 'agreementAccepted') !== 'true') {
    return { ok: false, message: t('errorAgreementRequired') };
  }

  // Initials act as the provider's signature on the agreement (Liz).
  // Required alongside the checkbox; 2-10 characters.
  const agreementInitials = str(formData, 'agreementInitials').trim();
  if (agreementInitials.length < 2 || agreementInitials.length > 10) {
    return { ok: false, message: t('errorAgreementInitials') };
  }

  // Two-tier launch: providerTier = 'community' takes the non-verified
  // path — confirmed email + phone + agreement attestation (checked
  // above), low-risk category, Canada only, NO government ID.
  const tierRaw = str(formData, 'providerTier');
  const providerTier: ProviderTier = isProviderTier(tierRaw) ? tierRaw : 'verified';
  if (providerTier === 'community') {
    const gate = checkCommunityGate({
      emailConfirmedAt: session.emailConfirmedAt,
      phone: p.phone,
      agreementAccepted: true, // enforced above (checkbox + initials)
    });
    if (!gate.ok) {
      return {
        ok: false,
        message: t(
          gate.reason === 'email_unconfirmed'
            ? 'errorCommunityEmail'
            : gate.reason === 'phone_required'
              ? 'errorCommunityPhone'
              : 'errorAgreementRequired'
        ),
      };
    }
    if (!COMMUNITY_ALLOWED_CATEGORIES.has(p.category) || (p.country || 'CA').toUpperCase() !== 'CA') {
      return {
        ok: false,
        message: t(!COMMUNITY_ALLOWED_CATEGORIES.has(p.category) ? 'errorCommunityCategory' : 'errorCommunityCountry'),
      };
    }
  }

  // Government ID verification is mandatory for VERIFIED providers.
  // The IdUploader writes to the private `verification-docs` bucket
  // under `<userId>/id.<ext>`, so the server re-checks storage rather
  // than trusting the client.
  let idDocumentPath: string | null = null;
  if (providerTier === 'verified') {
    const { data: idFiles, error: idListError } = await supabase.storage
      .from('verification-docs')
      .list(userId);
    if (idListError || !idFiles || idFiles.length === 0) {
      return { ok: false, message: t('errorIdRequired') };
    }
    // Save the path so the admin queue can show "ID ✓" and view the
    // document. Required — never null for a valid Verified onboarding.
    idDocumentPath = `${userId}/${idFiles[0].name}`;
  }

  const baseRow = {
    user_id: userId,
    business_name: p.businessName,
    category: p.category,
    description: p.description || null,
    country: p.country,
    city: p.city || null,
    phone: p.phone || null,
    whatsapp: p.whatsapp || null,
    languages: p.languages,
    status: 'pending',
    id_document_path: idDocumentPath,
  };
  // Agreement acceptance (columns from migration 0035). If the migration
  // isn't applied yet the insert fails on the unknown column — retry
  // without the agreement columns so onboarding still works.
  // NOTE: `agreement_initials` has no migration yet — it rides the same
  // fallback. A migration adding `providers.agreement_initials text`
  // will make the initials persist.
  let provider: { id: string } | null = null;
  let providerError: unknown = null;
  {
    const withAgreement = {
      ...baseRow,
      agreement_version: PROVIDER_AGREEMENT_VERSION,
      agreement_accepted_at: new Date().toISOString(),
      agreement_initials: agreementInitials,
      provider_tier: providerTier,
    };
    const r1 = await supabase.from('providers').insert(withAgreement).select('id').single();
    if (r1.error && /provider_tier/.test(r1.error.message)) {
      if (providerTier === 'community') {
        // FAIL CLOSED (see the onboarding API route): never create an
        // unlabelled Community row that would default to 'verified'
        // when migration 0052 is applied.
        return { ok: false, message: t('errorGeneric') };
      }
      const { provider_tier: _tier, ...noTier } = withAgreement;
      const r1b = await supabase.from('providers').insert(noTier).select('id').single();
      provider = r1b.data;
      providerError = r1b.error;
    } else if (r1.error && /agreement_version|agreement_accepted_at|agreement_initials/.test(r1.error.message)) {
      const r2 = await supabase.from('providers').insert(baseRow).select('id').single();
      provider = r2.data;
      providerError = r2.error;
    } else {
      provider = r1.data;
      providerError = r1.error;
    }
  }

  if (providerError || !provider)
    return { ok: false, message: t('errorGeneric') };

  const { error: listingError } = await supabase.from('listings').insert({
    provider_id: provider.id,
    title: l.title,
    description: l.description || null,
    category: l.category,
    subcategory: l.subcategory || null,
    price_cents: l.priceCents,
    price_type: l.priceType,
    country: l.country || p.country,
    city: l.city || p.city || null,
    status: 'draft',
  });

  if (listingError) return { ok: false, message: t('errorGeneric') };

  // Return success — the client handles the redirect (avoids NEXT_REDIRECT
  // issues with useActionState that caused client-side crashes).
  return { ok: true, message: '' };
}

/** Create a listing under the caller's own provider row. */
export async function createListing(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await providerT(locale);

  const validated = await validateListing(formData, t);
  if (!validated.ok) return { ok: false, message: validated.message };

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const providerId = await ownProviderId(supabase, userId);
  if (!providerId) return { ok: false, message: t('errorNotProvider') };

  const l = validated.value;
  if ((await ownProviderTier(supabase, userId)) === 'community') {
    const violation = await communityListingViolation(supabase, providerId, {
      category: l.category,
      subcategory: l.subcategory,
      country: l.country,
      status: l.status,
    });
    if (violation) return { ok: false, message: t(violation) };
  }
  const { error } = await insertListingRow(supabase, {
    provider_id: providerId,
    title: l.title,
    description: l.description || null,
    category: l.category,
    subcategory: l.subcategory || null,
    price_cents: l.priceCents,
    price_type: l.priceType,
    country: l.country,
    city: l.city || null,
    status: l.status,
    photos: l.photos,
    latitude: l.latitude,
    longitude: l.longitude,
  });

  if (error) return { ok: false, message: t('errorGeneric') };

  redirect(localizedPath('/app/provider', locale));
}

/** Update one of the caller's own listings. */
export async function updateListing(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await providerT(locale);

  const validated = await validateListing(formData, t);
  if (!validated.ok) return { ok: false, message: validated.message };

  const listingId = str(formData, 'id');
  if (!listingId) return { ok: false, message: t('errorGeneric') };

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const providerId = await ownProviderId(supabase, userId);
  if (!providerId) return { ok: false, message: t('errorNotProvider') };

  const l = validated.value;
  if ((await ownProviderTier(supabase, userId)) === 'community') {
    const violation = await communityListingViolation(supabase, providerId, {
      category: l.category,
      subcategory: l.subcategory,
      country: l.country,
      status: l.status,
      listingId,
    });
    if (violation) return { ok: false, message: t(violation) };
  }
  // RLS ("Owners update own listings") rejects anything not owned —
  // the eq(provider_id) is belt-and-suspenders.
  const { error } = await updateListingRow(
    supabase,
    {
      title: l.title,
      description: l.description || null,
      category: l.category,
      subcategory: l.subcategory || null,
      price_cents: l.priceCents,
      price_type: l.priceType,
      country: l.country,
      city: l.city || null,
      status: l.status,
      photos: l.photos,
      latitude: l.latitude,
      longitude: l.longitude,
    },
    listingId,
    providerId
  );

  if (error) return { ok: false, message: t('errorGeneric') };

  redirect(localizedPath('/app/provider', locale));
}

/** Delete one of the caller's own listings. */
export async function deleteListing(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const listingId = str(formData, 'id');
  const session = await requireUser(await providerT(locale));
  if (!session.ok) redirect(localizedPath('/app/provider', locale));
  const { supabase, userId } = session;

  const providerId = await ownProviderId(supabase, userId);
  if (providerId && listingId) {
    await supabase
      .from('listings')
      .delete()
      .eq('id', listingId)
      .eq('provider_id', providerId);
  }
  revalidatePath(localizedPath('/app/provider', locale));
  redirect(localizedPath('/app/provider', locale));
}

/** Pause or reactivate one of the caller's own listings. */
export async function setListingStatus(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const t = await providerT(locale);
  const listingId = str(formData, 'id');
  const status = str(formData, 'status');

  const session = await requireUser(t);
  if (!session.ok) redirect(localizedPath('/app/provider', locale));
  const { supabase, userId } = session;

  const providerId = await ownProviderId(supabase, userId);
  if (providerId && listingId && (status === 'active' || status === 'paused')) {
    let allowed = true;
    if (status === 'active' && (await ownProviderTier(supabase, userId)) === 'community') {
      const { data: listing } = await supabase
        .from('listings')
        .select('category, subcategory, country')
        .eq('id', listingId)
        .eq('provider_id', providerId)
        .maybeSingle();
      if (!listing) {
        allowed = false;
      } else {
        const violation = await communityListingViolation(supabase, providerId, {
          category: listing.category,
          subcategory: listing.subcategory ?? '',
          country: listing.country,
          status: 'active',
          listingId,
        });
        if (violation) allowed = false;
      }
    }
    if (allowed) {
      await supabase
        .from('listings')
        .update({ status })
        .eq('id', listingId)
        .eq('provider_id', providerId);
    }
  }
  revalidatePath(localizedPath('/app/provider', locale));
}

/** Admin: is the caller an admin? Uses the SECURITY DEFINER helper. */
async function requireAdmin(
  t: Awaited<ReturnType<typeof providerT>>
): Promise<
  | { ok: false; message: string }
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
    }
> {
  const session = await requireUser(t);
  if (!session.ok) return session;
  const { data } = await session.supabase.rpc('is_admin');
  if (data !== true) return { ok: false, message: t('errorNotAdmin') };
  return { ok: true, supabase: session.supabase };
}

/**
 * Admin: approve a provider. Also flips their profile role to 'provider'
 * (the role-escalation trigger allows this because the caller is an admin).
 */
export async function approveProvider(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const t = await providerT(locale);
  const providerId = str(formData, 'id');

  const admin = await requireAdmin(t);
  if (!admin.ok) redirect(localizedPath('/app/dashboard', locale));
  const { supabase } = admin;

  if (providerId) {
    const { data: provider } = await supabase
      .from('providers')
      .select('user_id')
      .eq('id', providerId)
      .single();
    await supabase
      .from('providers')
      .update({ status: 'approved' })
      .eq('id', providerId);
    if (provider) {
      await supabase
        .from('profiles')
        .update({ role: 'provider' })
        .eq('id', provider.user_id);
    }
  }
  revalidatePath(localizedPath('/app/admin/providers', locale));
}

/** Admin: reject a provider application. */
export async function rejectProvider(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const t = await providerT(locale);
  const providerId = str(formData, 'id');

  const admin = await requireAdmin(t);
  if (!admin.ok) redirect(localizedPath('/app/dashboard', locale));

  if (providerId) {
    await admin.supabase
      .from('providers')
      .update({ status: 'rejected' })
      .eq('id', providerId);
  }
  revalidatePath(localizedPath('/app/admin/providers', locale));
}
