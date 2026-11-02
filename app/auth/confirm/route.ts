import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Cross-device email-link confirmation (password recovery + any future
 * token_hash links).
 *
 * Why this exists: the default Supabase email link uses the PKCE flow —
 * the email's ConfirmationURL redirects to /auth/callback with ?code=,
 * and exchanging that code requires the code-verifier cookie stored in
 * the browser that REQUESTED the reset. Opening the email on a
 * different device/browser (the normal case: request on a laptop, read
 * mail on a phone) therefore always failed with "code challenge does
 * not match", and the failed attempt consumed the one-time token, so a
 * second tap failed too ("One-time token not found").
 *
 * This route uses the token_hash + verifyOtp pattern instead: the
 * email template links straight here with ?token_hash=...&type=..., and
 * verifyOtp proves possession of the emailed token server-side. No
 * state from the requesting browser is involved, so the link works on
 * any device.
 *
 * GET renders a one-tap interstitial instead of verifying immediately:
 * mail security scanners prefetch links, and a token-consuming GET
 * would burn the one-time token before the user ever taps. The POST
 * (a real form submit, which scanners don't perform) calls verifyOtp
 * and sets the session cookies on the redirect response.
 */

/** Mirrors EmailOtpType from @supabase/auth-js (not a direct dependency). */
type OtpType =
  | 'recovery'
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'email_change'
  | 'email';

const OTP_TYPES: readonly OtpType[] = [
  'recovery',
  'signup',
  'invite',
  'magiclink',
  'email_change',
  'email',
];

function parseOtpType(value: string | null): OtpType | null {
  return value && (OTP_TYPES as readonly string[]).includes(value)
    ? (value as OtpType)
    : null;
}

function loginError(origin: string) {
  return NextResponse.redirect(new URL('/login?error=recovery', origin));
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = parseOtpType(searchParams.get('type'));
  const next = safeNextPath(searchParams.get('next')) ?? '/app/dashboard';

  if (!tokenHash || !type) {
    console.error('[auth/confirm] GET with missing/invalid params', {
      hasTokenHash: Boolean(tokenHash),
      typeParam: searchParams.get('type'),
    });
    return loginError(origin);
  }

  const isRecovery = type === 'recovery';
  const heading = isRecovery ? 'Reset your password' : 'Confirm your sign-in';
  const blurb = isRecovery
    ? 'Tap the button below to continue to the new-password form. This link works on this device — you don’t need the device where you requested the reset.'
    : 'Tap the button below to continue signing in. This link works on this device — you don’t need the device where you requested it.';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${heading} — Zervia</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f7fb;color:#12263a;">
  <main style="max-width:26rem;margin:12vh auto 0;padding:2rem 1.75rem;background:#ffffff;border-radius:1.25rem;box-shadow:0 8px 30px rgba(18,38,58,.08);">
    <h1 style="font-size:1.5rem;margin:0 0 .75rem;">${heading}</h1>
    <p style="font-size:1rem;line-height:1.5;margin:0 0 1.5rem;">${blurb}</p>
    <form method="post" action="/auth/confirm">
      <input type="hidden" name="token_hash" value="${escapeAttr(tokenHash)}" />
      <input type="hidden" name="type" value="${escapeAttr(type)}" />
      <input type="hidden" name="next" value="${escapeAttr(next)}" />
      <button type="submit" style="display:block;width:100%;padding:.85rem 1rem;font-size:1rem;font-weight:600;color:#ffffff;background:#1d4ed8;border:0;border-radius:.75rem;cursor:pointer;">Continue</button>
    </form>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const form = await request.formData().catch(() => null);
  const tokenHash = form?.get('token_hash');
  const type = parseOtpType(
    typeof form?.get('type') === 'string' ? (form.get('type') as string) : null
  );
  const next = safeNextPath(form?.get('next')) ?? '/app/dashboard';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (typeof tokenHash !== 'string' || !tokenHash || !type || !url || !key) {
    console.error('[auth/confirm] POST with missing/invalid params', {
      hasTokenHash: typeof tokenHash === 'string' && Boolean(tokenHash),
      typeValid: Boolean(type),
      configured: Boolean(url && key),
    });
    return loginError(origin);
  }

  // Session cookies are written onto this redirect response by the
  // Supabase client (same plumbing as /auth/callback).
  const response = NextResponse.redirect(new URL(next, origin));
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (error) {
    // Never log the token itself — just the failure shape, so expired /
    // already-used links are diagnosable from server logs.
    console.error('[auth/confirm] verifyOtp failed:', error.message, {
      code: (error as { code?: string }).code,
      type,
    });
    return loginError(origin);
  }

  return response;
}
