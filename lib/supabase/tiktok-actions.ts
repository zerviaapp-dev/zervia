'use server';

import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import {
  getTikTokConfig,
  isTikTokConfigured,
  pushProductToTikTok,
  TikTokShopNotConfigured,
} from '@/lib/tiktok-shop';
import type { ActionResult } from './actions';

async function tiktokT(locale: string) {
  return getTranslations({ locale, namespace: 'Provider' });
}

export interface TikTokStatus {
  configured: boolean;
  shopId: string | null;
}

/**
 * Connection status for the TikTok Shop panel. Exposes the shop id (not a
 * secret) so the UI can show which shop is linked; never leaks keys.
 */
export async function getTikTokStatus(): Promise<TikTokStatus> {
  const configured = isTikTokConfigured();
  if (!configured) return { configured: false, shopId: null };
  let shopId: string | null = null;
  try {
    shopId = getTikTokConfig().shopId;
  } catch {
    shopId = null;
  }
  return { configured, shopId };
}

/**
 * Push one of the caller's products to TikTok Shop.
 *
 * Validates provider ownership, then calls the TikTok Shop client. Every
 * failure path returns a translated, user-facing message — nothing throws
 * out to the UI. Results are logged server-side for the founder's audit.
 */
export async function pushProductToTikTokAction(
  productId: string,
  locale: string = defaultLocale
): Promise<ActionResult> {
  const t = await tiktokT(locale);

  if (!isSupabaseConfigured()) {
    return { ok: false, message: t('tiktokNotConfigured') };
  }
  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: t('tiktokSignInRequired') };
  }
  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!provider) {
    return { ok: false, message: t('tiktokSignInRequired') };
  }

  const { data: product } = (await supabase
    .from('products')
    .select('id, name, description, price_cents, images, stock')
    .eq('id', productId)
    .eq('provider_id', (provider as { id: string }).id)
    .maybeSingle()) as {
    data: {
      id: string;
      name: string;
      description: string;
      price_cents: number;
      images: string[];
      stock: number;
    } | null;
  };
  if (!product) {
    return { ok: false, message: t('tiktokNotYourProduct') };
  }

  try {
    const result = await pushProductToTikTok({
      name: product.name,
      description: product.description ?? '',
      priceCents: product.price_cents,
      imageUrls: product.images ?? [],
      stock: product.stock ?? -1,
    });
    console.log(
      `[tiktok] pushed product ${product.id} -> tiktok ${result.tiktokProductId} (provider ${(provider as { id: string }).id})`
    );
    return { ok: true, message: t('tiktokPushSuccess') };
  } catch (err) {
    if (err instanceof TikTokShopNotConfigured) {
      console.warn('[tiktok] push attempted while unconfigured', { productId });
      return { ok: false, message: t('tiktokNotConfiguredText') };
    }
    console.warn('[tiktok] push failed', { productId, err });
    return { ok: false, message: t('tiktokPushFailed') };
  }
}
