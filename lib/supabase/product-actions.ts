'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import {
  searchCjProducts,
  getCjProductDetail,
  isCjConfigured,
  type CjProductSummary,
} from '@/lib/cj-dropshipping';
import type { ActionResult } from './actions';


async function productsT(locale: string) {
  return getTranslations({ locale, namespace: 'Products' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

async function ownProviderId(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  return provider ? { userId: user.id, providerId: (provider as { id: string }).id } : null;
}

export interface ProductRow {
  id: string;
  provider_id: string;
  cj_product_id: string | null;
  cj_variant_id: string | null;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  images: string[];
  category: string;
  stock: number;
  active: boolean;
}

/** Public-safe product shape (never includes cost_cents). */
function toPublicProduct(row: ProductRow) {
  const { ...rest } = row;
  return rest;
}

/** List the caller's own products (includes cost for the owner). */
export async function getMyProducts(): Promise<(ProductRow & { cost_cents: number })[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = (await createClient())!;
  const own = await ownProviderId(supabase);
  if (!own) return [];
  try {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('provider_id', own.providerId)
      .order('created_at', { ascending: false });
    return (data ?? []) as (ProductRow & { cost_cents: number })[];
  } catch {
    return [];
  }
}

/** Public: active products for the marketplace (paginated). */
export async function getActiveProducts(limit = 24, offset = 0): Promise<ProductRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = (await createClient())!;
  try {
    const { data } = await supabase
      .from('products')
      .select(
        'id, provider_id, cj_product_id, cj_variant_id, name, description, price_cents, currency, images, category, stock, active'
      )
      .eq('active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    return (data ?? []) as ProductRow[];
  } catch {
    return [];
  }
}

/** Public: single active product by id (no cost_cents). */
export async function getProduct(id: string): Promise<ProductRow | null> {
  if (!isSupabaseConfigured() || !id) return null;
  const supabase = (await createClient())!;
  try {
    const { data } = await supabase
      .from('products')
      .select(
        'id, provider_id, cj_product_id, cj_variant_id, name, description, price_cents, currency, images, category, stock, active'
      )
      .eq('id', id)
      .eq('active', true)
      .maybeSingle();
    return (data as ProductRow | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Add a product to the caller's shop from a CJ catalog item.
 * price is the customer-facing price in cents (provider sets markup).
 */
export async function addProductFromCj(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'errorNotConfigured' };
  const locale = localeOf(formData);
  const t = await productsT(locale);
  const supabase = (await createClient())!;
  const own = await ownProviderId(supabase);
  if (!own) return { ok: false, message: t('errorNotProvider') };

  const cjPid = str(formData, 'cjPid');
  const name = str(formData, 'name');
  const priceCents = Math.round(Number(str(formData, 'priceCents')) || 0);
  const costCents = Math.round(Number(str(formData, 'costCents')) || 0);
  const description = str(formData, 'description');
  const image = str(formData, 'image');
  const category = str(formData, 'category') || 'general';

  if (!name || priceCents <= 0) {
    return { ok: false, message: t('errorInvalidProduct') };
  }
  if (priceCents < costCents) {
    return { ok: false, message: t('errorPriceBelowCost') };
  }

  try {
    const { error } = await supabase.from('products').insert({
      provider_id: own.providerId,
      supplier: 'cj',
      supplier_product_id: cjPid || null,
      cj_product_id: cjPid || null,
      name,
      description,
      price_cents: priceCents,
      cost_cents: costCents,
      images: image ? [image] : [],
      category,
      stock: -1,
      active: true,
    });
    if (error) throw error;
  } catch {
    return { ok: false, message: t('errorAddFailed') };
  }

  revalidatePath(localizedPath('/app/provider/products', locale));
  return { ok: true, message: t('productAdded') };
}

/** Toggle a product's active flag (owner only). */
export async function toggleProductActive(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'errorNotConfigured' };
  const locale = localeOf(formData);
  const t = await productsT(locale);
  const supabase = (await createClient())!;
  const own = await ownProviderId(supabase);
  if (!own) return { ok: false, message: t('errorNotProvider') };

  const id = str(formData, 'id');
  const active = str(formData, 'active') === 'true';
  try {
    const { error } = await supabase
      .from('products')
      .update({ active })
      .eq('id', id)
      .eq('provider_id', own.providerId);
    if (error) throw error;
  } catch {
    return { ok: false, message: t('errorUpdateFailed') };
  }
  revalidatePath(localizedPath('/app/provider/products', locale));
  return { ok: true, message: t('productUpdated') };
}

/** Update price (owner only). */
export async function updateProductPrice(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'errorNotConfigured' };
  const locale = localeOf(formData);
  const t = await productsT(locale);
  const supabase = (await createClient())!;
  const own = await ownProviderId(supabase);
  if (!own) return { ok: false, message: t('errorNotProvider') };

  const id = str(formData, 'id');
  const priceCents = Math.round(Number(str(formData, 'priceCents')) || 0);
  if (priceCents <= 0) return { ok: false, message: t('errorInvalidProduct') };

  try {
    // Guard: price must stay >= cost.
    const { data: row } = await supabase
      .from('products')
      .select('cost_cents')
      .eq('id', id)
      .eq('provider_id', own.providerId)
      .maybeSingle();
    const cost = (row as { cost_cents?: number } | null)?.cost_cents ?? 0;
    if (priceCents < cost) return { ok: false, message: t('errorPriceBelowCost') };
    const { error } = await supabase
      .from('products')
      .update({ price_cents: priceCents })
      .eq('id', id)
      .eq('provider_id', own.providerId);
    if (error) throw error;
  } catch {
    return { ok: false, message: t('errorUpdateFailed') };
  }
  revalidatePath(localizedPath('/app/provider/products', locale));
  return { ok: true, message: t('productUpdated') };
}

/** Delete a product (owner only). Blocked if it has paid orders. */
export async function deleteProduct(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'errorNotConfigured' };
  const locale = localeOf(formData);
  const t = await productsT(locale);
  const supabase = (await createClient())!;
  const own = await ownProviderId(supabase);
  if (!own) return { ok: false, message: t('errorNotProvider') };

  const id = str(formData, 'id');
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('provider_id', own.providerId);
    if (error) throw error;
  } catch {
    return { ok: false, message: t('errorDeleteFailed') };
  }
  revalidatePath(localizedPath('/app/provider/products', locale));
  return { ok: true, message: t('productDeleted') };
}

// ---------------------------------------------------------------------------
// CJ catalog search (server-side so the key never reaches the browser)
// ---------------------------------------------------------------------------

export interface CjSearchResult {
  configured: boolean;
  results: CjProductSummary[];
  total: number;
}

export async function searchCjCatalog(
  keyword: string,
  page = 1
): Promise<CjSearchResult> {
  if (!isCjConfigured()) return { configured: false, results: [], total: 0 };
  try {
    const data = await searchCjProducts(keyword, page, 20);
    if (!data) return { configured: true, results: [], total: 0 };
    return { configured: true, results: data.list ?? [], total: data.total ?? 0 };
  } catch {
    return { configured: true, results: [], total: 0 };
  }
}

export async function getCjDetail(pid: string) {
  if (!isCjConfigured()) return null;
  try {
    return await getCjProductDetail(pid);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface ProductOrderRow {
  id: string;
  product_id: string;
  provider_id: string;
  buyer_id: string;
  quantity: number;
  unit_price_cents: number;
  platform_fee_cents: number;
  total_cents: number;
  currency: string;
  status: string;
  cj_order_id: string | null;
  cj_tracking_number: string | null;
  fulfillment_queued: boolean;
  created_at: string;
}

/** Buyer's own product orders. */
export async function getMyProductOrders(): Promise<ProductOrderRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  try {
    const { data } = await supabase
      .from('product_orders')
      .select('*')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });
    return (data ?? []) as ProductOrderRow[];
  } catch {
    return [];
  }
}

/** Provider's product sales. */
export async function getProviderProductOrders(): Promise<ProductOrderRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = (await createClient())!;
  const own = await ownProviderId(supabase);
  if (!own) return [];
  try {
    const { data } = await supabase
      .from('product_orders')
      .select('*')
      .eq('provider_id', own.providerId)
      .order('created_at', { ascending: false });
    return (data ?? []) as ProductOrderRow[];
  } catch {
    return [];
  }
}
