'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale, locales } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import { isCategory, isSubcategory, isPriceType, isListingStatus } from '@/lib/categories';
import type { ActionResult } from './actions';

export type { ActionResult };

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

function validateProvider(
  formData: FormData,
  t: Awaited<ReturnType<typeof providerT>>
): { ok: true; value: ValidatedProvider } | { ok: false; message: string } {
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
};

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

function validateListing(
  formData: FormData,
  t: Awaited<ReturnType<typeof providerT>>
): { ok: true; value: ValidatedListing } | { ok: false; message: string } {
  const title = str(formData, 'title');
  const description = str(formData, 'description');
  const category = str(formData, 'category');
  const subcategory = str(formData, 'subcategory');
  const priceRaw = str(formData, 'price');
  const priceType = str(formData, 'priceType') || 'quote';
  const country = str(formData, 'country');
  const city = str(formData, 'city');
  const status = str(formData, 'status') || 'draft';

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
    }
> {
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };
  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSessionExpired') };
  return { ok: true, supabase, userId: user.id };
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
  const locale = localeOf(formData);
  const t = await providerT(locale);

  const validated = validateProvider(formData, t);
  if (!validated.ok) return { ok: false, message: validated.message };
  const listingValidated = validateListing(formData, t);
  if (!listingValidated.ok)
    return { ok: false, message: listingValidated.message };

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  if (await ownProviderId(supabase, userId))
    return { ok: false, message: t('errorAlreadyProvider') };

  const p = validated.value;
  const l = listingValidated.value;

  const { data: provider, error: providerError } = await supabase
    .from('providers')
    .insert({
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
    })
    .select('id')
    .single();

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

  redirect(localizedPath('/app/provider', locale));
}

/** Create a listing under the caller's own provider row. */
export async function createListing(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await providerT(locale);

  const validated = validateListing(formData, t);
  if (!validated.ok) return { ok: false, message: validated.message };

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const providerId = await ownProviderId(supabase, userId);
  if (!providerId) return { ok: false, message: t('errorNotProvider') };

  const l = validated.value;
  const { error } = await supabase.from('listings').insert({
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

  const validated = validateListing(formData, t);
  if (!validated.ok) return { ok: false, message: validated.message };

  const listingId = str(formData, 'id');
  if (!listingId) return { ok: false, message: t('errorGeneric') };

  const session = await requireUser(t);
  if (!session.ok) return { ok: false, message: session.message };
  const { supabase, userId } = session;

  const providerId = await ownProviderId(supabase, userId);
  if (!providerId) return { ok: false, message: t('errorNotProvider') };

  const l = validated.value;
  // RLS ("Owners update own listings") rejects anything not owned —
  // the eq(provider_id) is belt-and-suspenders.
  const { error } = await supabase
    .from('listings')
    .update({
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
    })
    .eq('id', listingId)
    .eq('provider_id', providerId);

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
    await supabase
      .from('listings')
      .update({ status })
      .eq('id', listingId)
      .eq('provider_id', providerId);
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
