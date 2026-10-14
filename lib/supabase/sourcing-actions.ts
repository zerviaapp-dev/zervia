'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import {
  searchAliExpressProducts,
  isAliExpressConfigured,
} from '@/lib/aliexpress-sourcing';
import {
  fetch1688ProductInfo,
  type Import1688Result,
} from '@/lib/sourcing-1688';
import type { SourcedProduct } from '@/lib/product-sourcing';
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

export interface AliExpressSearchActionResult extends ActionResult {
  products?: SourcedProduct[];
  total?: number;
  isSample?: boolean;
  configured?: boolean;
}

/**
 * Server-side AliExpress catalog search. Keys stay server-side.
 * Returns sample results (isSample) when API keys aren't configured.
 */
export async function searchAliExpress(
  _prev: AliExpressSearchActionResult,
  formData: FormData
): Promise<AliExpressSearchActionResult> {
  const locale = localeOf(formData);
  const t = await providerT(locale);
  const query = str(formData, 'query');
  if (!query) {
    return { ok: false, message: t('sourcingSearchEmpty') };
  }
  try {
    const result = await searchAliExpressProducts({
      query,
      page: 1,
      pageSize: 20,
      language: locale === 'zh' ? 'ZH' : 'EN',
    });
    return {
      ok: true,
      message: '',
      products: result.products,
      total: result.total,
      isSample: result.isSample,
      configured: isAliExpressConfigured(),
    };
  } catch {
    return { ok: false, message: t('sourcingSearchFailed') };
  }
}

export interface Import1688ActionResult extends ActionResult {
  product?: SourcedProduct;
}

/**
 * Server-side 1688 URL import (fetch + scrape). Never exposes raw HTML.
 */
export async function import1688Url(
  _prev: Import1688ActionResult,
  formData: FormData
): Promise<Import1688ActionResult> {
  const locale = localeOf(formData);
  const t = await providerT(locale);
  const url = str(formData, 'url');
  if (!url) {
    return { ok: false, message: t('sourcing1688Empty') };
  }
  const result: Import1688Result = await fetch1688ProductInfo(url);
  if (!result.ok || !result.product) {
    const key =
      result.error === 'invalid_url'
        ? 'sourcing1688InvalidUrl'
        : result.error === 'fetch_failed'
          ? 'sourcing1688FetchFailed'
          : 'sourcing1688ParseFailed';
    return { ok: false, message: t(key) };
  }
  return { ok: true, message: '', product: result.product };
}

export interface ImportProductActionResult extends ActionResult {
  productId?: string;
}

/**
 * Add a sourced product to the caller's shop.
 * Inserts into the `products` table (migration 0030_products.sql, owned by
 * the CJ integration). Degrades gracefully with a clear message until that
 * migration is applied.
 */
export async function importSourcedProduct(
  _prev: ImportProductActionResult,
  formData: FormData
): Promise<ImportProductActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'errorNotConfigured' };
  const locale = localeOf(formData);
  const t = await providerT(locale);

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSessionExpired') };

  const { data: provider } = (await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  if (!provider) return { ok: false, message: t('errorNotProvider') };

  let draft: SourcedProduct & { priceCents?: number; category?: string; stock?: number };
  try {
    draft = JSON.parse(str(formData, 'product'));
  } catch {
    return { ok: false, message: t('sourcingImportInvalid') };
  }

  const priceCents = Math.round(Number(draft.priceCents) || 0);
  if (priceCents <= 0) {
    return { ok: false, message: t('sourcingImportPriceRequired') };
  }
  const name = String(draft.name ?? '').trim().slice(0, 200);
  if (!name) {
    return { ok: false, message: t('sourcingImportNameRequired') };
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .insert({
        provider_id: provider.id,
        supplier:
          draft.supplier === '1688' || draft.supplier === 'aliexpress'
            ? draft.supplier
            : 'manual',
        supplier_product_id: String(draft.supplierProductId ?? '').slice(0, 500),
        name,
        description: String(draft.description ?? '').slice(0, 2000) || null,
        price_cents: priceCents,
        cost_cents:
          typeof draft.costCents === 'number' && draft.costCents > 0
            ? Math.round(draft.costCents)
            : null,
        images: Array.isArray(draft.images)
          ? draft.images.filter((u) => typeof u === 'string').slice(0, 6)
          : [],
        category: String(draft.category ?? '').slice(0, 100) || null,
        stock: Math.max(0, Math.round(Number(draft.stock) || 0)),
        active: true,
        source_url: draft.sourceUrl ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(localizedPath('/app/provider/products', locale));
    revalidatePath(localizedPath('/app/provider/sourcing', locale));
    return { ok: true, message: t('sourcingImportSuccess'), productId: data.id };
  } catch (err) {
    // Most likely: products table doesn't exist yet (migration 0030 pending).
    console.error('[sourcing] import failed:', err);
    return { ok: false, message: t('sourcingImportUnavailable') };
  }
}
