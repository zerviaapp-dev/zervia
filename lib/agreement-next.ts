import { localizedPath } from './locale-path';

/**
 * Sanitize the re-acceptance gate's `next` target. Only provider-surface
 * paths are allowed (with or without a locale prefix), never the gate or
 * onboarding itself (redirect loops), never external/protocol-relative
 * URLs. Anything else falls back to the provider dashboard.
 */
export function sanitizeAgreementNext(
  next: string | undefined | null,
  locale: string
): string {
  const fallback = localizedPath('/app/provider', locale);
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  const path = next.split(/[?#]/)[0];
  if (!/^\/(?:[a-z]{2}\/)?app\/provider(?:\/.*)?$/.test(path)) return fallback;
  if (
    path.includes('/app/provider/agreement') ||
    path.includes('/app/provider/onboarding')
  ) {
    return fallback;
  }
  return path;
}
