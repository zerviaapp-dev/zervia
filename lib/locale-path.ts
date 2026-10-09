import { defaultLocale } from './locales';

/**
 * Prefix a path with the locale, honouring the "as-needed" routing:
 * English (default) has no prefix — `/login`; others do — `/tl/login`.
 */
export function localizedPath(path: string, locale: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (!locale || locale === defaultLocale) return clean;
  return `/${locale}${clean}`;
}
