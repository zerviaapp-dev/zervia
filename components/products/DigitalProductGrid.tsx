'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { DigitalProduct } from '@/lib/digital-products';
import { ProductPreviewButton } from '@/components/products/ProductPreview';

function formatCad(priceCad: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CAD',
  }).format(priceCad);
}

export function DigitalProductGrid({
  products,
  locale,
}: {
  products: DigitalProduct[];
  locale: string;
}) {
  const t = useTranslations('DigitalProducts');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.category)))],
    [products]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, query, category]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="min-h-[48px] w-full flex-1 rounded-xl border-2 border-brand-200 bg-white px-4 text-brand-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Category filter">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={
              'min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors ' +
              (category === c
                ? 'bg-brand-600 text-white'
                : 'bg-brand-50 text-brand-700 hover:bg-brand-100')
            }
          >
            {c === 'All' ? t('allCategories') : c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-slate-500">{t('noResults')}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link
              key={p.slug}
              href={`/products/${p.slug}`}
              className="group overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-[0_2px_16px_rgba(11,91,211,0.08)] transition-shadow hover:shadow-[0_4px_24px_rgba(11,91,211,0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-50">
                <Image
                  src={p.cover}
                  alt={p.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {p.badge ? (
                  <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-amber-950">
                    {p.badge}
                  </span>
                ) : null}
                <ProductPreviewButton product={p} variant="overlay" />
              </div>
              <div className="space-y-2 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-500">
                  {p.category}
                </p>
                <h3 className="text-lg font-bold leading-snug text-brand-900">
                  {p.title}
                </h3>
                <p className="line-clamp-2 text-sm text-slate-600">{p.tagline}</p>
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-xl font-extrabold text-brand-700">
                    {formatCad(p.priceCad, locale)}
                  </span>
                  {p.compareAtCad ? (
                    <span className="text-sm text-slate-400 line-through">
                      {formatCad(p.compareAtCad, locale)}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
