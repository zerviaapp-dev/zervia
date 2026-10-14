/**
 * Secure site origin helper.
 *
 * SECURITY: Never trust the client-controlled `Origin` header for building
 * redirect/checkout URLs (open redirect vulnerability). This helper uses a
 * hardcoded allowlist of production domains plus server-side env config.
 *
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL (explicit production config)
 * 2. VERCEL_PROJECT_PRODUCTION_URL (Vercel auto-provides)
 * 3. VERCEL_URL (Vercel preview deployments)
 * 4. https://zervia.app (hardcoded production fallback)
 */

const ALLOWED_HOSTS = new Set([
  'zervia.app',
  'www.zervia.app',
  'zervia-app-deploy.vercel.app',
]);

export function getSiteOrigin(requestOrigin?: string | null): string {
  // 1. Explicit server-side config wins.
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 2. Validate a caller-supplied origin against the allowlist.
  //    This is a convenience for local dev only — production always
  //    resolves via env above.
  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      if (ALLOWED_HOSTS.has(url.hostname)) {
        return `${url.protocol}//${url.hostname}`;
      }
    } catch {
      // Invalid URL — fall through to default.
    }
  }

  // 3. Hardcoded production fallback. Never empty, never client-controlled.
  return 'https://zervia.app';
}
