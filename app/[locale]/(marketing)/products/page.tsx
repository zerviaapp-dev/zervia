import { getTranslations } from 'next-intl/server';
import { DIGITAL_PRODUCTS } from '@/lib/digital-products';
import { DigitalProductGrid } from '@/components/products/DigitalProductGrid';

export const metadata = {
  title: 'Digital Products — Zervia',
  description:
    'Ebooks, language courses, trades courses and wellness programs by Zervia. Instant download, lifetime access.',
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

      <DigitalProductGrid products={DIGITAL_PRODUCTS} locale={locale} />
    </div>
  );
}
