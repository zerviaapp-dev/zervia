/**
 * Open-redirect-safe relative-path check (shared by the auth callback route
 * and the sign-in server action).
 *
 * Why not a simple startsWith('/') guard: WHATWG URL parsing treats `\` as
 * `/` for http(s) URLs, so `/\evil.com` passes a naive
 * `startsWith('/') && !startsWith('//')` check yet resolves to
 * `https://evil.com/` — a phishing assist after legitimate login.
 *
 * The check canonicalizes via the URL parser against a dummy origin and
 * only accepts values that stay on that origin as a plain path.
 */
const DUMMY_ORIGIN = 'http://localhost';

export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > 2048) return null;
  // Belt-and-braces: backslashes never belong in an in-app redirect target.
  if (value.includes('\\')) return null;
  let u: URL;
  try {
    u = new URL(value, DUMMY_ORIGIN);
  } catch {
    return null;
  }
  if (u.origin !== DUMMY_ORIGIN) return null;
  const target = u.pathname + u.search + u.hash;
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  return target;
}
