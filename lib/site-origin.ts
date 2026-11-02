/**
 * Secure site origin helper.
 *
 * SECURITY: Never trust the client-controlled `Origin` header for building
 * redirect/checkout URLs (open redirect vulnerability).
 *
 * PRODUCTION RULE (live-test fix batch Z7, Oct 20 2026): in production the
 * origin is ALWAYS the canonical https://www.zervia.app. The previous
 * priority chain trusted NEXT_PUBLIC_SITE_URL first — and that variable
 * had been seeded from .env.example with the deployment host
 * zervia-app-deploy.vercel.app, so Supabase confirmation / recovery
 * emails linked to the vercel.app host (the recurring Oct 12–13 bug:
 * expired-token links, users landing on the wrong host, saved sign-ins
 * rejected). An env value on a *.vercel.app host must never win in
 * production again.
 */

const CANONICAL_ORIGIN = 'https://www.zervia.app';
const CANONICAL_HOSTS = new Set(['zervia.app', 'www.zervia.app']);

export function getSiteOrigin(requestOrigin?: string | null): string {
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Explicit config is honoured only when it points at a canonical
  //    production host (or always, outside production, for local dev).
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configured) {
    try {
      const host = new URL(configured).hostname;
      if (!isProd || CANONICAL_HOSTS.has(host)) return configured;
      // Production + non-canonical host (e.g. *.vercel.app): ignore it.
    } catch {
      // Malformed env value — fall through.
    }
  }

  // 2. Production: canonical, unconditionally.
  if (isProd) return CANONICAL_ORIGIN;

  // 3. Development / preview conveniences.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return `${url.protocol}//${url.host}`;
      }
    } catch {
      // fall through
    }
  }
  return 'http://localhost:3000';
}
