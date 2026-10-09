import type { MetadataRoute } from 'next';
import { locales, defaultLocale } from '@/lib/locales';

/**
 * /sitemap.xml — public marketing pages in every locale.
 * With localePrefix 'as-needed', the default locale (en) has no prefix.
 * Auth/app/API routes are excluded (gated, not for crawlers).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://zervia-app-deploy.vercel.app';
  const pages = ['/', '/discover', '/pricing', '/terms', '/privacy', '/refunds'];

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    const prefix = locale === defaultLocale ? '' : `/${locale}`;
    for (const page of pages) {
      entries.push({
        url: `${base}${prefix}${page === '/' ? '' : page}`,
        lastModified: new Date(),
        changeFrequency: page === '/' ? 'weekly' : 'monthly',
        priority: page === '/' ? 1 : 0.7,
      });
    }
  }
  return entries;
}
