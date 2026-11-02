import { getTranslations } from 'next-intl/server';

/**
 * Affiliate / connector disclosure (L2). Rendered in the marketing
 * footer, the listing Provider Connect card, the offers shelf, and
 * sourced-product surfaces. The disclosure always precedes the click.
 *
 * Variants (live-test fix batch Z5, Oct 20 2026):
 * - `subtle` (default): one small, muted line — used in the footer and
 *   other browsing chrome. The disclosure stays PRESENT on every page
 *   (it must be available before any click we may earn from) without
 *   reading as a banner while people are just searching.
 * - `prominent`: full-size, readable text — used at commitment points
 *   (the Provider Connect card right before the outbound click, product
 *   purchase surfaces), where the disclosure does its legal work.
 */
export async function AffiliateNote({
  locale,
  variant = 'subtle',
}: {
  locale: string;
  variant?: 'subtle' | 'prominent';
}) {
  const t = await getTranslations({ locale, namespace: 'Connect' });
  if (variant === 'prominent') {
    return (
      <p className="text-xs leading-relaxed text-brand-700">{t('affiliateNote')}</p>
    );
  }
  return (
    <p className="text-[11px] leading-snug text-slate-400">{t('affiliateNote')}</p>
  );
}
