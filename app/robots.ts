import type { MetadataRoute } from 'next';

/**
 * /robots.txt — allow all crawlers on public pages.
 * Auth/app routes are already gated by middleware; admin routes additionally
 * require the admin role. Nothing sensitive is reachable via crawl.
 */
export default function robots(): MetadataRoute.Robots {
  const base = 'https://zervia-app-deploy.vercel.app';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
