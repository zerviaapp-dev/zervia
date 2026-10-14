'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';
import { deleteCustomerPhoto, MAX_PORTFOLIO_ITEMS } from './storage';
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

/**
 * Add one portfolio item (photo URL + caption) to the caller's provider.
 * The photo itself is uploaded client-side via uploadCustomerPhoto; this
 * action only records the row, enforcing ownership and the item cap.
 */
export async function addPortfolioItem(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
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

  const photoUrl = str(formData, 'photoUrl');
  const caption = str(formData, 'caption').slice(0, 140);

  if (!photoUrl || !/^https:\/\//.test(photoUrl)) {
    return { ok: false, message: t('portfolioErrorPhoto') };
  }

  const { count } = await supabase
    .from('portfolio_items')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', provider.id);
  if ((count ?? 0) >= MAX_PORTFOLIO_ITEMS) {
    return { ok: false, message: t('portfolioMaxReached', { max: MAX_PORTFOLIO_ITEMS }) };
  }

  const { error } = await supabase.from('portfolio_items').insert({
    provider_id: provider.id,
    photo_url: photoUrl,
    caption: caption || null,
    sort_order: count ?? 0,
  });
  if (error) return { ok: false, message: t('errorGeneric') };

  revalidatePath(localizedPath('/app/provider', locale));
  return { ok: true, message: t('portfolioAdded') };
}

/**
 * Delete one of the caller's own portfolio items (row + storage object,
 * best effort on the storage side).
 */
export async function deletePortfolioItem(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
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

  const itemId = str(formData, 'itemId');
  if (!itemId) return { ok: false, message: t('errorGeneric') };

  const { data: item } = (await supabase
    .from('portfolio_items')
    .select('id, photo_url')
    .eq('id', itemId)
    .eq('provider_id', provider.id)
    .maybeSingle()) as { data: { id: string; photo_url: string } | null };
  if (!item) return { ok: false, message: t('errorGeneric') };

  const { error } = await supabase
    .from('portfolio_items')
    .delete()
    .eq('id', item.id);
  if (error) return { ok: false, message: t('errorGeneric') };

  // Best effort: orphaned objects are harmless (public bucket, tiny).
  await deleteCustomerPhoto(item.photo_url);

  revalidatePath(localizedPath('/app/provider', locale));
  return { ok: true, message: t('portfolioDeleted') };
}
