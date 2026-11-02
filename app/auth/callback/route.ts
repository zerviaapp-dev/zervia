import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Auth callback: Supabase redirects email links here with ?code=.
 * Exchanges the code for a session, then sends the user on to `next`
 * (dashboard by default, reset-password for recovery links).
 * New providers (is_provider in user metadata) go to provider onboarding.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (code && url && key) {
    // Start with the default target; the Location header is adjusted
    // after we know whether the user signed up as a provider.
    const response = NextResponse.redirect(new URL('/app/dashboard', origin));
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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Resolve the final target: explicit ?next= wins (open-redirect safe
      // via safeNextPath — rejects backslash bypasses like /\evil.com),
      // then provider intent from signup metadata, then the dashboard.
      let next = safeNextPath(rawNext) ?? '/app/dashboard';
      if (!rawNext) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (
            user?.user_metadata &&
            (user.user_metadata as Record<string, unknown>).is_provider === true
          ) {
            next = '/app/provider/onboarding';
          }
        } catch {
          // Metadata lookup failed — fall through to the default target.
        }
      }
      response.headers.set('Location', new URL(next, origin).toString());
      return response;
    }
    // Exchange failed — log the shape (never the code itself) so silent
    // bounces to login are diagnosable. The classic cause is the PKCE
    // cross-device flaw: the code-verifier cookie lives in the browser
    // that requested the link, so opening it elsewhere can never
    // succeed. Password recovery no longer uses this route (it goes
    // through /auth/confirm with token_hash + verifyOtp); this path
    // remains for OAuth and same-device email links.
    console.error(
      '[auth/callback] exchangeCodeForSession failed:',
      error.message,
      { code: (error as { code?: string }).code }
    );
  } else {
    console.error('[auth/callback] callback hit without a usable code', {
      hasCode: Boolean(code),
      configured: Boolean(url && key),
    });
  }

  return NextResponse.redirect(new URL('/login?error=verification', origin));
}
