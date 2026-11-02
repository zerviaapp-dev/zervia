import { getTranslations } from 'next-intl/server';
import { DIGITAL_PRODUCTS } from '@/lib/digital-products';
import { DigitalProductGrid } from '@/components/products/DigitalProductGrid';
import { AffiliateNote } from '@/components/AffiliateNote';
import { isDigitalProductsLive } from '@/lib/booking-flag';

export const metadata = {
  title: 'Digital Products — Zervia',
  // Z-3 (Oct 23, 2026): description must match the paused state — the
  // body renders "Digital product sales are paused", so search/share
  // snippets must not advertise instant-download sales while
  // DIGITAL_PRODUCTS_LIVE is off. Restore sales language only when
  // the flag flips with Liz's explicit GO.
  description:
    'Ebooks, language courses, trades courses and wellness programs by Zervia. Digital product sales are currently paused — existing buyers keep full access to their library.',
};

/**
 * Public digital products catalog: all Zervia ebooks, courses and
 * programs with cover art, CAD pricing, category filter and search.
 * Content comes from the static catalog in lib/digital-products.ts.
 */
export default async function DigitalProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'DigitalProducts' });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-900 sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mx-auto max-w-2xl text-base text-slate-600">{t('subtitle')}</p>
      </div>

      {isDigitalProductsLive() ? (
        <DigitalProductGrid products={DIGITAL_PRODUCTS} locale={locale} />
      ) : (
        <div className="mx-auto max-w-2xl rounded-2xl border border-brand-100 bg-brand-50 px-6 py-8 text-center">
          <p className="text-lg font-bold text-brand-900">
            Digital product sales are paused
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            We&apos;ve paused sales of our ebooks, courses and guides while
            they go through an independent review. If you already bought
            one, it stays in your Library — your access is unchanged.
          </p>
        </div>
      )}
      <div className="mx-auto max-w-2xl text-center">
        <AffiliateNote locale={locale} />
      </div>
    </div>
  );
}
