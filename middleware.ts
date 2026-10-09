import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { defaultLocale, locales } from './lib/locales';
import { updateSession } from './lib/supabase/middleware';

const intlMiddleware = createIntlMiddleware(routing);

/** Strip an optional locale prefix: "/tl/app/dashboard" -> { locale: "tl", rest: "/app/dashboard" }. */
function stripLocale(pathname: string): { locale: string; rest: string } {
  const segment = pathname.split('/')[1] ?? '';
  if ((locales as readonly string[]).includes(segment)) {
    return { locale: segment, rest: `/${pathname.split('/').slice(2).join('/')}` };
  }
  return { locale: defaultLocale, rest: pathname };
}

function loginPath(locale: string): string {
  return locale === defaultLocale ? '/login' : `/${locale}/login`;
}

export default async function middleware(request: NextRequest) {
  // The auth callback manages its own cookies and must never be
  // locale-rewritten (its URL is baked into Supabase email templates).
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // 1. next-intl first: locale validation / prefix redirects.
  const intlResponse = intlMiddleware(request);
  if (intlResponse.headers.get('location')) return intlResponse;

  // 2. Refresh the Supabase session, attaching cookies to the response.
  const { user, role } = await updateSession(request, intlResponse);

  // 3. Gate protected routes: everything under /app/* needs a session.
  const { locale, rest } = stripLocale(request.nextUrl.pathname);
  const isProtected = rest === '/app' || rest.startsWith('/app/');
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = loginPath(locale);
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // 4. Admin routes: /app/admin/* needs the admin role. The page itself
  // re-checks server-side (defence in depth); this stops non-admins early.
  const isAdminRoute = rest === '/app/admin' || rest.startsWith('/app/admin/');
  if (isAdminRoute && role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname =
      locale === defaultLocale ? '/app/dashboard' : `/${locale}/app/dashboard`;
    return NextResponse.redirect(url);
  }

  return intlResponse;
}

export const config = {
  // Skip API routes, Next.js internals, and static files.
  // (The /auth/* early-return above handles the callback; the matcher
  // alone can't exclude it because Next.js tests it unanchored.)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
