'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient, isSupabaseConfigured } from './server';
import { verifyTurnstile } from '@/lib/turnstile';
import { defaultLocale } from '@/lib/locales';
import { localizedPath } from '@/lib/locale-path';

export type ActionResult = { ok: boolean; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authT(locale: string) {
  return getTranslations({ locale, namespace: 'Auth' });
}

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

/** Only allow relative redirect targets (open-redirect protection). */
function safeNext(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  // Fallback for server actions where origin header may be missing.
  // NEXT_PUBLIC_SITE_URL should be set in production; Vercel provides
  // VERCEL_PROJECT_PRODUCTION_URL automatically.
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://zervia-app-deploy.vercel.app';
}

/** Create a new account: email + password + name + country + language. */
export async function signUp(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await authT(locale);

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const fullName = String(formData.get('fullName') ?? '').trim();
  const country = String(formData.get('country') ?? '');
  const language = String(formData.get('language') ?? locale);
  // Optional referral code (ZBXXXXXX). Normalized here; the database trigger
  // validates it strictly and silently ignores bad codes — signup never fails
  // because of a typo'd code.
  const referralCode = String(formData.get('referralCode') ?? '')
    .trim()
    .toUpperCase();

  if (!EMAIL_RE.test(email))
    return { ok: false, message: t('errorInvalidEmail') };
  if (password.length < 8)
    return { ok: false, message: t('errorShortPassword') };
  if (password !== confirm)
    return { ok: false, message: t('errorPasswordMismatch') };
  if (fullName.length < 2)
    return { ok: false, message: t('errorNameRequired') };
  if (!country) return { ok: false, message: t('errorCountryRequired') };

  // Bot check: Cloudflare Turnstile. Fail closed in production — the
  // verifyTurnstile helper rejects when the secret key is missing there,
  // so the form can never be silently unprotected in prod.
  const token = formData.get('cf-turnstile-response');
  const turnstile = await verifyTurnstile(
    typeof token === 'string' ? token : null
  );
  if (!turnstile.ok) {
    return { ok: false, message: t('errorBotCheck') };
  }

  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };

  const supabase = (await createClient())!;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        country,
        preferred_locale: language,
        ...(referralCode ? { referral_code: referralCode } : {}),
      },
      emailRedirectTo: `${await siteOrigin()}/auth/callback`,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists'))
      return { ok: false, message: t('errorUserExists') };
    // Log the real error server-side so auth failures are debuggable.
    // Map common infrastructure failures to user-friendly text.
    console.error('[signUp] supabase.auth.signUp failed:', error.message);
    if (msg.includes('rate limit') || msg.includes('too many'))
      return { ok: false, message: t('errorRateLimited') };
    if (msg.includes('email') && msg.includes('send'))
      return { ok: false, message: t('errorEmailSend') };
    return { ok: false, message: t('errorGeneric') };
  }
  redirect(localizedPath('/verify-email', locale));
}

/** Sign in with email + password. */
export async function signIn(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await authT(locale);

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!EMAIL_RE.test(email))
    return { ok: false, message: t('errorInvalidEmail') };
  if (!password) return { ok: false, message: t('errorShortPassword') };
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };

  const supabase = (await createClient())!;
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('email not confirmed'))
      return { ok: false, message: t('errorEmailNotConfirmed') };
    if (msg.includes('invalid login'))
      return { ok: false, message: t('errorInvalidCredentials') };
    // Log the real error server-side so auth failures are debuggable.
    console.error('[signIn] supabase.auth.signInWithPassword failed:', error.message);
    if (msg.includes('rate limit') || msg.includes('too many'))
      return { ok: false, message: t('errorRateLimited') };
    return { ok: false, message: t('errorGeneric') };
  }

  const next =
    safeNext(formData.get('next')) ?? localizedPath('/app/dashboard', locale);
  redirect(next);
}

/** Email me a one-tap sign-in link (magic link). */
export async function requestMagicLink(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await authT(locale);

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email))
    return { ok: false, message: t('errorInvalidEmail') };
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };

  const supabase = (await createClient())!;
  // Supabase returns no error for unknown emails — no account enumeration.
  await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  return { ok: true, message: t('magicSent') };
}

/** Resend the signup confirmation email. Always "succeeds" to avoid
 * account enumeration — an attacker can't probe which emails are registered.
 */
export async function resendConfirmation(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await authT(locale);

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email))
    return { ok: false, message: t('errorInvalidEmail') };
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };

  const supabase = (await createClient())!;
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) {
    console.error('[resendConfirmation] supabase.auth.resend failed:', error.message);
  }
  // Intentionally generic: don't reveal whether the email is registered.
  return { ok: true, message: t('verifyResent') };
}

/** Send a password-reset email. Always "succeeds" to avoid enumeration. */
export async function requestPasswordReset(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await authT(locale);

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email))
    return { ok: false, message: t('errorInvalidEmail') };
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };

  const supabase = (await createClient())!;
  const resetPath = encodeURIComponent(
    localizedPath('/reset-password', locale)
  );
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=${resetPath}`,
  });
  return { ok: true, message: t('forgotSent') };
}

/** Set a new password (user arrived via the reset link). */
export async function updatePassword(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await authT(locale);

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < 8)
    return { ok: false, message: t('errorShortPassword') };
  if (password !== confirm)
    return { ok: false, message: t('errorPasswordMismatch') };
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSessionExpired') };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: t('errorGeneric') };

  redirect(localizedPath('/app/dashboard', locale));
}

/** Sign out everywhere on this device. */
export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect(localizedPath('/', locale));
}

/** Update the user's own profile (name + country). Role is admin-only. */
export async function updateProfile(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await authT(locale);

  const fullName = String(formData.get('fullName') ?? '').trim();
  const country = String(formData.get('country') ?? '');

  if (fullName.length < 2)
    return { ok: false, message: t('errorNameRequired') };
  if (!country) return { ok: false, message: t('errorCountryRequired') };
  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSessionExpired') };

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, country })
    .eq('id', user.id);
  if (error) return { ok: false, message: t('errorGeneric') };

  const ta = await getTranslations({ locale, namespace: 'Account' });
  return { ok: true, message: ta('profileSaved') };
}

/**
 * Phase 1 "Become a provider": records the intent as pending.
 * Full provider profiles arrive in Phase 2; an admin approves the intent
 * and flips the profile role then.
 */
export async function requestProviderIntent(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await authT(locale);
  const ta = await getTranslations({ locale, namespace: 'Account' });

  if (!isSupabaseConfigured())
    return { ok: false, message: t('errorNotConfigured') };

  const supabase = (await createClient())!;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('errorSessionExpired') };

  const { data: existing } = await supabase
    .from('provider_intents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return { ok: true, message: ta('becomePending') };

  const { error } = await supabase
    .from('provider_intents')
    .insert({ user_id: user.id });
  if (error) return { ok: false, message: t('errorGeneric') };

  return { ok: true, message: ta('becomePending') };
}
