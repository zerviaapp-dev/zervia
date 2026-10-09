'use server';

import { revalidatePath } from 'next/cache';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import type { ActionResult } from './actions';

export type { ActionResult };

const DOC_TYPES = ['government_id', 'professional_license', 'insurance_proof', 'background_check'] as const;

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/**
 * Provider submits a verification document for admin review.
 * The actual file upload goes to the `verification-docs` storage bucket
 * (private); this action records the document row. Defence in depth:
 * the provider's own document is marked pending, and only admins can
 * change its status (RLS + the sync trigger in migration 0017).
 */
export async function requestVerification(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Supabase is not configured.' };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: 'Please sign in.' };
  }

  const docType = str(formData, 'doc_type');
  if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
    return { ok: false, message: 'Invalid document type.' };
  }
  const storagePath = str(formData, 'storage_path');
  if (!storagePath) {
    return { ok: false, message: 'Please upload your document first.' };
  }

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!provider) {
    return { ok: false, message: 'No provider profile found.' };
  }

  // One pending document per type: replace a rejected/pending one, don't stack.
  await supabase
    .from('verification_documents')
    .delete()
    .eq('provider_id', provider.id)
    .eq('doc_type', docType)
    .in('status', ['pending', 'rejected']);

  const { error } = await supabase.from('verification_documents').insert({
    provider_id: provider.id,
    doc_type: docType,
    storage_path: storagePath,
    status: 'pending',
  });
  if (error) {
    return { ok: false, message: 'Could not submit. Please try again.' };
  }

  // Mark the provider's verification status as pending (ID only).
  if (docType === 'government_id') {
    await supabase
      .from('providers')
      .update({ id_verification_status: 'pending' })
      .eq('id', provider.id);
  } else if (docType === 'background_check') {
    await supabase
      .from('providers')
      .update({ background_check_status: 'pending' })
      .eq('id', provider.id);
  }

  const locale = localeOf(formData);
  revalidatePath(`/${locale}/app/provider/verification`);
  return { ok: true, message: '' };
}

/**
 * Admin approves a verification document.
 * The 0017 sync trigger flips the matching provider flag automatically.
 */
export async function approveVerification(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Supabase is not configured.' };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: 'Please sign in.' };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    return { ok: false, message: 'Admin only.' };
  }

  const docId = str(formData, 'doc_id');
  const { error } = await supabase
    .from('verification_documents')
    .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', docId);
  if (error) {
    return { ok: false, message: 'Could not approve. Please try again.' };
  }

  const locale = localeOf(formData);
  revalidatePath(`/${locale}/app/admin/verification`);
  return { ok: true, message: '' };
}

/**
 * Admin rejects a verification document with a reason.
 */
export async function rejectVerification(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Supabase is not configured.' };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: 'Please sign in.' };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    return { ok: false, message: 'Admin only.' };
  }

  const docId = str(formData, 'doc_id');
  const reason = str(formData, 'rejection_reason');
  const { error } = await supabase
    .from('verification_documents')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason || null,
    })
    .eq('id', docId);
  if (error) {
    return { ok: false, message: 'Could not reject. Please try again.' };
  }

  const locale = localeOf(formData);
  revalidatePath(`/${locale}/app/admin/verification`);
  return { ok: true, message: '' };
}
