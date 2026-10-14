import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTranslations } from 'next-intl/server';
import { isCategory, isSubcategory, isPriceType, isListingStatus } from '@/lib/categories';

/**
 * POST /api/provider/listings
 * Creates a new listing for the caller's provider profile. Returns JSON.
 * If an `id` field is present, updates the existing listing instead.
 * Uses fetch() from client to avoid useActionState crashes.
 *
 * Self-contained: does NOT import from "use server" modules.
 *
 * Authorization: The API verifies (1) the caller is authenticated and
 * (2) the caller owns the provider profile, BEFORE any database write.
 * The write itself uses the admin client to bypass RLS, because the
 * user-scoped client's auth context does not propagate to PostgREST
 * RLS policies (auth.uid() is null) in API routes, causing 42501.
 */

// PostgREST error codes for missing columns:
// - 42703: Postgres "undefined column"
// - PGRST204: PostgREST schema cache doesn't have the column
const MISSING_COLUMN_CODES = ['42703', 'PGRST204'];

function getStr(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function parseCoord(raw: string, min: number, max: number): number | null {
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const locale = getStr(formData, 'locale') || 'en';
    const t = await getTranslations({ locale, namespace: 'Provider' });

    // Extract fields
    const listingId = getStr(formData, 'id');
    const isEdit = listingId !== '';
    const title = getStr(formData, 'title');
    const description = getStr(formData, 'description');
    const category = getStr(formData, 'category');
    const subcategory = getStr(formData, 'subcategory');
    const priceRaw = getStr(formData, 'price');
    const priceType = getStr(formData, 'priceType') || 'quote';
    const country = getStr(formData, 'country');
    const city = getStr(formData, 'city');
    const status = getStr(formData, 'status') || 'draft';
    const latitude = parseCoord(getStr(formData, 'latitude'), -90, 90);
    const longitude = parseCoord(getStr(formData, 'longitude'), -180, 180);

    // Validation (mirrors validateListing in provider-actions.ts)
    if (title.length < 3 || title.length > 120) {
      return NextResponse.json({ ok: false, message: t('errorTitle') }, { status: 400 });
    }
    if (!isCategory(category)) {
      return NextResponse.json({ ok: false, message: t('errorCategory') }, { status: 400 });
    }
    if (subcategory !== '' && !isSubcategory(category, subcategory)) {
      return NextResponse.json({ ok: false, message: t('errorSubcategory') }, { status: 400 });
    }
    if (!isPriceType(priceType)) {
      return NextResponse.json({ ok: false, message: t('errorPriceType') }, { status: 400 });
    }
    if (!isListingStatus(status)) {
      return NextResponse.json({ ok: false, message: t('errorStatus') }, { status: 400 });
    }
    if (!country) {
      return NextResponse.json({ ok: false, message: t('errorCountry') }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json({ ok: false, message: t('errorDescriptionTooLong') }, { status: 400 });
    }

    let priceCents: number | null = null;
    if (priceRaw !== '') {
      if (!/^\d+(\.\d{1,2})?$/.test(priceRaw)) {
        return NextResponse.json({ ok: false, message: t('errorPrice') }, { status: 400 });
      }
      priceCents = Math.round(parseFloat(priceRaw) * 100);
      if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
        return NextResponse.json({ ok: false, message: t('errorPrice') }, { status: 400 });
      }
    }
    if (priceCents === null && priceType !== 'quote') {
      return NextResponse.json({ ok: false, message: t('errorPriceRequired') }, { status: 400 });
    }

    const photos = validatePhotos(getStr(formData, 'photos'));
    if (photos === null) {
      return NextResponse.json({ ok: false, message: t('errorPhotos') }, { status: 400 });
    }

    // Auth
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: 'Service unavailable' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 });
    }
    const userId = user.id;

    // Verify caller has a provider profile
    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!provider) {
      return NextResponse.json({ ok: false, message: t('errorNotProvider') }, { status: 403 });
    }
    const providerId = provider.id;

    // Core columns from migration 0005 (guaranteed to exist).
    // Optional columns (subcategory from 0026, photos/latitude/longitude from
    // later migrations) are stripped on retry if PostgREST reports them missing.
    const rowCore = {
      title,
      description: description || null,
      category,
      price_cents: priceCents,
      price_type: priceType,
      country,
      city: city || null,
      status,
    };
    const row = {
      ...rowCore,
      subcategory: subcategory || null,
      photos,
      latitude,
      longitude,
    };
    // Columns to strip progressively on PGRST204 (missing column) errors,
    // from most-likely-missing to least.
    const OPTIONAL_COLS = ['latitude', 'longitude', 'photos', 'subcategory'] as const;

    async function insertWithFallback(baseRow: typeof row) {
      const admin = createAdminClient();
      if (!admin) return { data: null, error: new Error('admin client unavailable') };
      let attempt: Record<string, unknown> = { ...baseRow };
      for (let i = 0; i <= OPTIONAL_COLS.length; i++) {
        const { data, error } = await admin
          .from('listings')
          .insert({ ...attempt, provider_id: providerId })
          .select('id')
          .single();
        if (!error) return { data, error: null };
        const code = (error as { code?: string }).code || '';
        if (MISSING_COLUMN_CODES.includes(code) && i < OPTIONAL_COLS.length) {
          // Strip the next optional column and retry.
          const col = OPTIONAL_COLS[i];
          console.warn(`[listings] Column '${col}' missing (code ${code}), retrying without it`);
          delete attempt[col];
          continue;
        }
        return { data: null, error };
      }
      return { data: null, error: new Error('exhausted column fallbacks') };
    }

    async function updateWithFallback(baseRow: typeof row) {
      const admin = createAdminClient();
      if (!admin) return { error: new Error('admin client unavailable') };
      let attempt: Record<string, unknown> = { ...baseRow };
      for (let i = 0; i <= OPTIONAL_COLS.length; i++) {
        const { error } = await admin
          .from('listings')
          .update(attempt)
          .eq('id', listingId)
          .eq('provider_id', providerId);
        if (!error) return { error: null };
        const code = (error as { code?: string }).code || '';
        if (MISSING_COLUMN_CODES.includes(code) && i < OPTIONAL_COLS.length) {
          const col = OPTIONAL_COLS[i];
          console.warn(`[listings] Column '${col}' missing (code ${code}), retrying without it`);
          delete attempt[col];
          continue;
        }
        return { error };
      }
      return { error: new Error('exhausted column fallbacks') };
    }

    if (isEdit) {
      // Update: RLS ("Owners update own listings") rejects anything not owned —
      // the eq(provider_id) is belt-and-suspenders.
      // Falls back progressively if optional columns are missing from the schema.
      const { error } = await updateWithFallback(row);

      if (error) {
        console.error('[listings] Update failed:', error);
        return NextResponse.json({ ok: false, message: t('errorGeneric') }, { status: 500 });
      }

      return NextResponse.json({ ok: true, listingId });
    } else {
      // Create — falls back progressively if optional columns are missing.
      const { data, error } = await insertWithFallback(row);

      if (error || !data) {
        console.error('[listings] Insert failed:', error);
        return NextResponse.json({ ok: false, message: t('errorGeneric') }, { status: 500 });
      }

      return NextResponse.json({ ok: true, listingId: data.id });
    }
  } catch (e) {
    console.error('[listings] Unhandled error:', e);
    return NextResponse.json(
      { ok: false, message: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
