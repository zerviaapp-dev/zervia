import type { MetadataRoute } from 'next';
import { locales, defaultLocale } from '@/lib/locales';
import { DIGITAL_PRODUCT_SLUGS } from '@/lib/digital-products';

/**
 * /sitemap.xml — public marketing pages in every locale.
 * With localePrefix 'as-needed', the default locale (en) has no prefix.
 * Auth/app/API routes are excluded (gated, not for crawlers).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://zervia.app';
  const pages = [
    '/',
    '/discover',
    '/services',
    '/providers',
    '/pricing',
    '/products',
    '/why-zervia',
    '/guarantee',
    '/provider-agreement',
    '/support',
    '/terms',
    '/privacy',
    '/refunds',
  ];

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    const prefix = locale === defaultLocale ? '' : `/${locale}`;
    for (const page of pages) {
      entries.push({
        url: `${base}${prefix}${page === '/' ? '' : page}`,
        lastModified: new Date(),
        changeFrequency: page === '/' ? 'weekly' : 'monthly',
        priority: page === '/' ? 1 : page === '/products' ? 0.8 : 0.7,
      });
    }
    // Digital product detail pages.
    for (const slug of DIGITAL_PRODUCT_SLUGS) {
      entries.push({
        url: `${base}${prefix}/products/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  }
  return entries;
}
