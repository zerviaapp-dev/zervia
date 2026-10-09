'use server';

import { createClient, isSupabaseConfigured } from './server';
import { rateLimit } from '@/lib/rate-limit';
import type { ActionResult } from './actions';

export type { ActionResult };

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_LISTING_PHOTOS = 5;

/** Validate a single uploaded image; returns the File or an error. */
function validateImage(
  value: FormDataEntryValue | null
): { ok: true; file: File } | { ok: false; message: string } {
  if (!(value instanceof File) || value.size === 0) {
    return { ok: false, message: 'errorNoFile' };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(value.type)) {
    return { ok: false, message: 'errorBadType' };
  }
  if (value.size > MAX_FILE_BYTES) {
    return { ok: false, message: 'errorTooLarge' };
  }
  return { ok: true, file: value };
}

function extOf(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Upload one listing photo to the public `listing-photos` bucket.
 * Stored as "<user_id>/<uuid>.<ext>" — matches the RLS folder policy.
 * Returns the public URL, or an error key.
 */
export async function uploadListingPhoto(
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'errorNotConfigured' };

  // Abuse guard: 20 photo uploads per IP per hour.
  if (!(await rateLimit('photo_upload', 20, 60 * 60 * 1000))) {
    return { ok: false, message: 'errorRateLimited' };
  }

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'errorSignInRequired' };

  const checked = validateImage(formData.get('photo'));
  if (!checked.ok) return checked;

  const path = `${user.id}/${crypto.randomUUID()}.${extOf(checked.file)}`;
  const { error } = await supabase.storage
    .from('listing-photos')
    .upload(path, checked.file, {
      contentType: checked.file.type,
      upsert: false,
    });

  if (error) return { ok: false, message: 'errorUploadFailed' };

  const {
    data: { publicUrl },
  } = supabase.storage.from('listing-photos').getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

/**
 * Upload a government ID photo to the PRIVATE `verification-docs` bucket.
 * Stored as "<user_id>/id.<ext>". Never publicly readable — the bucket has
 * no public-read policy (see migration 0012); only the owner and admins
 * can fetch it, via signed URLs server-side.
 */
export async function uploadIdDocument(
  formData: FormData
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'errorNotConfigured' };

  // Abuse guard: 5 ID uploads per IP per hour (IDs are sensitive; slow it down).
  if (!(await rateLimit('id_upload', 5, 60 * 60 * 1000))) {
    return { ok: false, message: 'errorRateLimited' };
  }

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'errorSignInRequired' };

  const checked = validateImage(formData.get('idDocument'));
  if (!checked.ok) return checked;

  const path = `${user.id}/id.${extOf(checked.file)}`;
  const { error } = await supabase.storage
    .from('verification-docs')
    .upload(path, checked.file, {
      contentType: checked.file.type,
      upsert: true, // replacing an old ID is fine and expected
    });

  if (error) return { ok: false, message: 'errorUploadFailed' };

  // Record the path on the provider row so the admin queue shows "ID ✓".
  await supabase
    .from('providers')
    .update({ id_document_path: path })
    .eq('user_id', user.id);

  return { ok: true, path };
}

/**
 * Delete one of the caller's own listing photos (by public URL).
 * The storage RLS folder policy is the final guard; this is the UI path.
 */
export async function deleteListingPhoto(
  photoUrl: string
): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured()) return { ok: false };
  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // Only allow deleting objects inside the caller's own folder.
  const prefix = `${user.id}/`;
  const idx = photoUrl.indexOf('/listing-photos/');
  if (idx === -1) return { ok: false };
  const path = photoUrl.slice(idx + '/listing-photos/'.length);
  if (!path.startsWith(prefix)) return { ok: false };

  const { error } = await supabase.storage.from('listing-photos').remove([path]);
  return { ok: !error };
}

export { MAX_LISTING_PHOTOS };

/**
 * Upload a verification document (any of the 4 doc types) to the PRIVATE
 * `verification-docs` bucket. Stored as "<user_id>/<doc_type>.<ext>".
 * Never publicly readable — only the owner and admins via signed URLs.
 */
export async function uploadVerificationDocument(
  formData: FormData
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'errorNotConfigured' };

  if (!(await rateLimit('verification_upload', 5, 60 * 60 * 1000))) {
    return { ok: false, message: 'errorRateLimited' };
  }

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'errorSignInRequired' };

  const docType = String(formData.get('docType') ?? 'government_id');
  if (!['government_id', 'professional_license', 'insurance_proof', 'background_check'].includes(docType)) {
    return { ok: false, message: 'errorBadType' };
  }

  const checked = validateImage(formData.get('document'));
  if (!checked.ok) return checked;

  const path = `${user.id}/${docType}.${extOf(checked.file)}`;
  const { error } = await supabase.storage
    .from('verification-docs')
    .upload(path, checked.file, {
      contentType: checked.file.type,
      upsert: true, // replacing an older submission is expected
    });

  if (error) return { ok: false, message: 'errorUploadFailed' };
  return { ok: true, path };
}
