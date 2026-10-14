import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { DigitalBuyButton } from '@/components/products/DigitalBuyButton';
import { ProductPreviewButton } from '@/components/products/ProductPreview';
import { isStripeConfigured } from '@/lib/stripe';
import type { DigitalProduct } from '@/lib/digital-products';
import { PaymentProtectedBadge } from '@/components/PaymentProtectedBadge';

function formatCad(priceCad: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CAD',
  }).format(priceCad);
}

/**
 * Detail view for a Zervia digital product (ebook, course, program):
 * cover, pricing, description, what's included, FAQ and the digital
 * Buy now flow. Rendered inside products/[id] when the id matches a
 * digital product slug.
 */
export async function DigitalProductDetail({
  product,
  locale,
}: {
  product: DigitalProduct;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'DigitalProducts' });
  const stripeReady = isStripeConfigured();

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <Link
        href="/products"
        className="text-sm font-semibold text-brand-600 hover:underline"
      >
        ← {t('backToProducts')}
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="relative overflow-hidden rounded-2xl border border-brand-100 shadow-[0_2px_16px_rgba(11,91,211,0.08)]">
            <Image
              src={product.cover}
              alt={product.title}
              width={1200}
              height={630}
              priority
              className="w-full object-cover"
            />
            {product.badge ? (
              <span className="absolute left-4 top-4 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-amber-950">
                {product.badge}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-500">
            {product.category}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">
            {product.title}
          </h1>
          <p className="text-base text-slate-600">{product.tagline}</p>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-brand-700">
              {formatCad(product.priceCad, locale)}
            </span>
            {product.compareAtCad ? (
              <span className="text-lg text-slate-400 line-through">
                {formatCad(product.compareAtCad, locale)}
              </span>
            ) : null}
          </div>
          {product.priceNote ? (
            <p className="text-sm font-semibold text-slate-500">{product.priceNote}</p>
          ) : (
            <p className="text-sm font-semibold text-slate-500">{t('oneTimePayment')}</p>
          )}

          <ul className="space-y-1 text-sm text-slate-600">
            <li>✓ {t('instantDelivery')}</li>
            <li>✓ {t('lifetimeAccess')}</li>
            <li>
              ✓ {t('soldBy')}
            </li>
          </ul>

          {stripeReady ? <DigitalBuyButton slug={product.slug} /> : null}
          <ProductPreviewButton product={product} variant="detail" />
          <div className="mt-4">
            <PaymentProtectedBadge locale={locale} variant="banner" />
          </div>
        </div>
      </div>

      <Panel>
        <div className="space-y-4">
          {product.description.map((para, i) => (
            <p key={i} className="leading-relaxed text-brand-900">
              {para}
            </p>
          ))}
        </div>
      </Panel>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-brand-900">{t('whatsIncluded')}</h2>
        <ul className="space-y-2">
          {product.includes.map((item, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-brand-50 px-4 py-3">
              <span aria-hidden className="font-bold text-brand-600">
                ✓
              </span>
              <span className="text-brand-900">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {product.faq.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-brand-900">{t('faqTitle')}</h2>
          <div className="space-y-3">
            {product.faq.map((f, i) => (
              <details
                key={i}
                className="group rounded-xl border border-brand-100 bg-white px-5 py-4"
              >
                <summary className="cursor-pointer list-none font-semibold text-brand-900 marker:hidden">
                  <span className="mr-2 inline-block transition-transform group-open:rotate-90">
                    ▶
                  </span>
                  {f.q}
                </summary>
                <p className="mt-3 leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
