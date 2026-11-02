import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { defaultLocale, locales } from './lib/locales';
import {
  updateSession,
  getProviderAgreementDecision,
} from './lib/supabase/middleware';

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

  // 3 (moved up). Gate protected routes: everything under /app/* needs a session.
  const { locale, rest } = stripLocale(request.nextUrl.pathname);
  const isProtected = rest === '/app' || rest.startsWith('/app/');

  // 1b. Anonymous public traffic skips the session refresh entirely
  // (Oct 23, 2026 — Fast Origin Transfer fix). Refreshing a Supabase
  // session on EVERY request — including bots and logged-out visitors
  // on public pages — attaches Set-Cookie headers, which marks the
  // response `private, no-store` and defeats the Vercel edge cache:
  // every hit became a full origin render and burned the free tier's
  // 10 GB Fast Origin Transfer allowance (100% used, Oct 23).
  // Anonymous visitors have no session to refresh, so skipping is
  // behaviour-identical for them; anyone carrying a Supabase auth
  // cookie, and every protected route, still gets the full refresh
  // + gating below, unchanged.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
  if (!isProtected && !hasAuthCookie) return intlResponse;

  // 2. Refresh the Supabase session, attaching cookies to the response.
  const { user, role } = await updateSession(request, intlResponse);
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

  // 5. Provider Agreement re-acceptance gate: a provider whose recorded
  // agreement_version is older than the current PROVIDER_AGREEMENT_VERSION
  // is routed to the re-acceptance screen before any provider surface.
  // Provider routes only — customers and public pages never hit this.
  // Exempt: onboarding (records acceptance itself) and the gate screen.
  // No provider row yet → decision is 'onboarding'/'pass', never gated.
  const isProviderRoute =
    rest === '/app/provider' || rest.startsWith('/app/provider/');
  const isGateExempt =
    rest === '/app/provider/onboarding' ||
    rest.startsWith('/app/provider/onboarding/') ||
    rest === '/app/provider/agreement' ||
    rest.startsWith('/app/provider/agreement/');
  if (user && isProviderRoute && !isGateExempt) {
    const decision = await getProviderAgreementDecision(
      request,
      intlResponse,
      user.id
    );
    if (decision === 'gate') {
      const url = request.nextUrl.clone();
      url.pathname =
        locale === defaultLocale
          ? '/app/provider/agreement'
          : `/${locale}/app/provider/agreement`;
      url.search = '';
      url.searchParams.set('next', request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  return intlResponse;
}

export const config = {
  // Skip API routes, Next.js internals, and static files.
  // (The /auth/* early-return above handles the callback; the matcher
  // alone can't exclude it because Next.js tests it unanchored.)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
