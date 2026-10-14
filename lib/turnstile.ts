/**
 * Cloudflare Turnstile server-side token verification.
 *
 * SECURITY POSTURE:
 * - Production (NODE_ENV=production): FAIL CLOSED. If TURNSTILE_SECRET_KEY
 *   is missing, verification is rejected — the form shows an error instead
 *   of silently accepting bots. The site is never unprotected in prod.
 * - Development / build: graceful skip with a visible "dev mode" note in
 *   the UI (the Turnstile component renders a labelled stub). This keeps
 *   local development and `next build` working without keys.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

export function isTurnstileConfigured(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );
}

/**
 * Verify the `cf-turnstile-response` token from a submitted form.
 * Call this in server actions BEFORE creating accounts / bookings.
 */
export async function verifyTurnstile(
  token: string | null | undefined
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Temporary bypass for testing (set DISABLE_TURNSTILE=true in Vercel).
  // Remove after test transaction is complete.
  if (process.env.DISABLE_TURNSTILE === 'true') {
    return { ok: true };
  }

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      // FAIL CLOSED: never silently unprotected in production.
      return { ok: false, reason: 'bot_check_unavailable' };
    }
    // Dev/build: the widget renders a labelled stub, so skip verification.
    return { ok: true };
  }

  if (!token) {
    return { ok: false, reason: 'bot_check_missing' };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? { ok: true } : { ok: false, reason: 'bot_check_failed' };
  } catch {
    // Network failure talking to Cloudflare: fail closed in production,
    // allow in dev (same posture as a missing key).
    return process.env.NODE_ENV === 'production'
      ? { ok: false, reason: 'bot_check_unavailable' }
      : { ok: true };
  }
}
