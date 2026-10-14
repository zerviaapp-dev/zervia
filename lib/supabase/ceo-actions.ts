'use server';

import { revalidatePath } from 'next/cache';
import { createClient, isSupabaseConfigured } from './server';
import { CEO_EMAIL } from '@/lib/ceo-products';
import type { ActionResult } from './actions';

export type CeoStatus = 'draft' | 'ready' | 'approved' | 'needs_revision' | 'rejected';

export type CeoReview = {
  slug: string;
  status: CeoStatus;
  notes: string | null;
  updated_at: string;
};

const VALID_STATUSES: CeoStatus[] = ['draft', 'ready', 'approved', 'needs_revision', 'rejected'];

/**
 * CEO gate: the owner email or a platform admin. Returns the user id,
 * or null when the caller is not the CEO. Every CEO action and page
 * calls this first — never rely on the URL being secret.
 */
export async function assertCeo(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (user.email === CEO_EMAIL) return user.id;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'admin') return user.id;
  return null;
}

/** All CEO review rows, keyed by product slug. Empty when table missing. */
export async function getCeoReviews(): Promise<Record<string, CeoReview>> {
  if (!(await assertCeo())) return {};
  const supabase = (await createClient())!;
  const { data, error } = await supabase.from('ceo_product_reviews').select('*');
  if (error || !data) return {};
  const out: Record<string, CeoReview> = {};
  for (const row of data as CeoReview[]) out[row.slug] = row;
  return out;
}

export async function setCeoProductStatus(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const userId = await assertCeo();
  if (!userId) return { ok: false, message: 'Not authorized.' };

  const slug = String(formData.get('slug') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim() as CeoStatus;
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 2000) || null;
  const locale = String(formData.get('locale') ?? '').trim() || 'en';

  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, message: 'Invalid product.' };
  if (!VALID_STATUSES.includes(status)) return { ok: false, message: 'Invalid status.' };

  const supabase = (await createClient())!;
  const { error } = await supabase.from('ceo_product_reviews').upsert(
    { slug, status, notes, reviewed_by: userId, updated_at: new Date().toISOString() },
    { onConflict: 'slug' }
  );
  if (error) return { ok: false, message: 'Could not save. Migration 0033 may not be applied yet.' };

  revalidatePath(`/${locale}/app/ceo/products`);
  revalidatePath(`/${locale}/app/ceo/products/${slug}`);
  return { ok: true, message: 'Saved.' };
}
