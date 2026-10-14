import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
      // Resolve the final target: explicit ?next= wins (open-redirect safe),
      // then provider intent from signup metadata, then the dashboard.
      let next =
        rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
          ? rawNext
          : '/app/dashboard';
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
  }

  return NextResponse.redirect(new URL('/login?error=verification', origin));
}
