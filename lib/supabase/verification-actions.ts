'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import type { ActionResult } from './actions';
import {
  createIdentityVerificationSession,
  getIdentityStatus,
  type IdentityStatus,
} from '@/lib/verification';


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

/**
 * Admin gets a short-lived signed URL to view a verification document.
 * The `verification-docs` bucket is private — documents are never exposed
 * publicly. The URL expires after 60 seconds. Returns { ok, url } or
 * { ok: false, message }.
 */
export async function getVerificationDocUrl(
  docId: string
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
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

  const { data: doc } = await supabase
    .from('verification_documents')
    .select('storage_path')
    .eq('id', docId)
    .maybeSingle();
  const storagePath = (doc as { storage_path?: string } | null)?.storage_path;
  if (!storagePath) {
    return { ok: false, message: 'Document not found.' };
  }

  const { data, error } = await supabase.storage
    .from('verification-docs')
    .createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) {
    return { ok: false, message: 'Could not generate a viewing link. Please try again.' };
  }
  return { ok: true, url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Stripe Identity (document) verification — server actions
// ---------------------------------------------------------------------------

export type IdentityActionResult = {
  ok: boolean;
  status?: IdentityStatus;
  url?: string;
  message?: string;
};

/** Site origin for Stripe return_url — same pattern as actions.ts. */
async function identitySiteOrigin(): Promise<string> {
  // SECURITY: Never trust the client-controlled Origin header (open redirect).
  const { getSiteOrigin } = await import('@/lib/site-origin');
  return getSiteOrigin();
}

type ProviderSession =
  | { ok: true; userId: string }
  | { ok: false; message: string };

/**
 * Auth + provider-role gate shared by the Identity actions.
 */
async function requireProviderForIdentity(): Promise<ProviderSession> {
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
  if (profile?.role !== 'provider') {
    return { ok: false, message: 'Providers only.' };
  }
  return { ok: true, userId: user.id };
}

/**
 * Provider starts Stripe Identity verification.
 * Returns the hosted Stripe URL — the client redirects the provider to it.
 * `returnUrl` must be an absolute same-origin URL (open-redirect protection);
 * falls back to the provider verification page.
 */
export async function startIdentityVerification(
  returnUrl: string
): Promise<IdentityActionResult> {
  const gate = await requireProviderForIdentity();
  if (!gate.ok) return gate;

  const origin = await identitySiteOrigin();
  let target: URL | null = null;
  try {
    const u = new URL(returnUrl);
    if (u.origin === origin) target = u;
  } catch {
    // Not an absolute URL — fall through to the default.
  }
  const safeReturnUrl = target
    ? target.toString()
    : `${origin}/${defaultLocale}/app/provider/verification`;

  const res = await createIdentityVerificationSession(gate.userId, safeReturnUrl);
  if (!res.ok) return { ok: false, message: res.error };
  return { ok: true, url: res.url };
}

/**
 * Provider reads their own Stripe Identity status.
 */
export async function getMyIdentityStatus(): Promise<IdentityActionResult> {
  const gate = await requireProviderForIdentity();
  if (!gate.ok) return gate;
  const status = await getIdentityStatus(gate.userId);
  return { ok: true, status };
}
