'use server';

import { revalidatePath } from 'next/cache';
import { createClient, isSupabaseConfigured } from './server';
import { localizedPath } from '@/lib/locale-path';
import {
  findPlaceId,
  fetchPlaceDetails,
  isGooglePlacesConfigured,
  type GooglePlaceMatch,
  type GoogleReview,
} from '@/lib/google-reviews';


export type FindBusinessResult =
  | { ok: true; place: GooglePlaceMatch }
  | { ok: false; errorKey: string };

export type ImportedReviewView = {
  authorName: string;
  rating: number;
  text: string;
  time: string;
};

export type ImportReviewsResult =
  | { ok: true; imported: ImportedReviewView[]; skipped: number }
  | { ok: false; errorKey: string };

/** The caller's provider row id, or null when not signed in / not a provider. */
async function ownProviderId(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: providerRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  return (providerRow as { id: string } | null)?.id ?? null;
}

function timeKey(t: string): number {
  const ms = new Date(t).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Find the provider's business on Google (Text Search). The Places API key
 * stays server-side; the client only ever sees the matched name/address.
 */
export async function findGoogleBusiness(
  businessName: string,
  city: string
): Promise<FindBusinessResult> {
  if (!isSupabaseConfigured()) return { ok: false, errorKey: 'errorNotConfigured' };
  if (!isGooglePlacesConfigured())
    return { ok: false, errorKey: 'googleReviewsNotConfigured' };

  const supabase = (await createClient())!;
  if (!(await ownProviderId(supabase)))
    return { ok: false, errorKey: 'errorSessionExpired' };

  const query = businessName.trim();
  if (!query) return { ok: false, errorKey: 'googleReviewsNameRequired' };

  const place = await findPlaceId(query, city.trim() || undefined);
  if (!place) return { ok: false, errorKey: 'googleReviewsNotFound' };
  return { ok: true, place };
}

/**
 * Fetch a Google place's reviews and store them on the caller's provider
 * profile, flagged `source = 'google'`. Dedupes by author + publish time so
 * re-importing never duplicates. Requires migration 0032 (source columns,
 * nullable booking/reviewer, import RLS policy) — until it is applied the
 * insert fails closed with a clear message instead of partial writes.
 */
export async function importGoogleReviews(
  placeId: string,
  locale: string
): Promise<ImportReviewsResult> {
  if (!isSupabaseConfigured()) return { ok: false, errorKey: 'errorNotConfigured' };
  if (!isGooglePlacesConfigured())
    return { ok: false, errorKey: 'googleReviewsNotConfigured' };

  const supabase = (await createClient())!;
  const providerId = await ownProviderId(supabase);
  if (!providerId) return { ok: false, errorKey: 'errorSessionExpired' };

  const details = await fetchPlaceDetails(placeId.trim());
  if (!details || details.reviews.length === 0)
    return { ok: false, errorKey: 'googleReviewsNoneFound' };

  // Existing imported reviews for dedupe by author + publish time.
  const { data: existing } = (await supabase
    .from('reviews')
    .select('source_author, created_at')
    .eq('provider_id', providerId)
    .eq('source', 'google')) as {
    data: Array<{ source_author: string | null; created_at: string }> | null;
  };
  const seen = new Set(
    (existing ?? []).map(
      (r) => `${(r.source_author ?? '').trim().toLowerCase()}|${timeKey(r.created_at)}`
    )
  );

  const fresh = details.reviews.filter(
    (r) =>
      !seen.has(`${r.authorName.trim().toLowerCase()}|${timeKey(r.time)}`)
  );
  if (fresh.length === 0)
    return { ok: true, imported: [], skipped: details.reviews.length };

  const rows = fresh.map((r: GoogleReview) => ({
    provider_id: providerId,
    booking_id: null,
    reviewer_id: null,
    rating: r.rating,
    text: r.text || null,
    created_at: new Date(r.time).toISOString(),
    source: 'google',
    source_author: r.authorName,
    source_url: details.mapsUrl,
  }));

  const { error } = await supabase.from('reviews').insert(rows);
  if (error) {
    // Migration 0032 not applied yet → the source columns don't exist.
    if ((error as { code?: string }).code === '42703')
      return { ok: false, errorKey: 'googleReviewsMigrationPending' };
    return { ok: false, errorKey: 'errorGeneric' };
  }

  revalidatePath(localizedPath('/app/provider', locale));

  return {
    ok: true,
    imported: fresh.map((r) => ({
      authorName: r.authorName,
      rating: r.rating,
      text: r.text,
      time: r.time,
    })),
    skipped: details.reviews.length - fresh.length,
  };
}
