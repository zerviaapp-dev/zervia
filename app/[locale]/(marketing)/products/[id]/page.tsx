import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { formatCurrency, currencyForCountry } from '@/lib/currency';
import { getProduct } from '@/lib/supabase/product-actions';
import { ProductBuyButton } from '@/components/products/ProductBuyButton';
import { AffiliateNote } from '@/components/AffiliateNote';
import { isProviderShopLive, isDigitalProductsLive } from '@/lib/booking-flag';
import { isStripeConfigured } from '@/lib/stripe';
import { getDigitalProduct } from '@/lib/digital-products';
import { DigitalProductDetail } from '@/components/products/DigitalProductDetail';
import { ReportButton } from '@/components/moderation/ReportButton';

/**
 * Public product detail page: images, description, price, seller info,
 * and the Buy now flow (Stripe Checkout). Gracefully degrades when
 * Supabase or Stripe aren't configured yet.
 *
 * When the id matches a Zervia digital product slug (ebooks, courses,
 * programs), the static digital catalog renders instead of the
 * marketplace Supabase lookup.
 */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const digital = getDigitalProduct(id);
  if (digital) {
    // QUARANTINE GATE (Oct 22, 2026): while digital product sales are
    // paused, detail pages show the pause notice — no price, no buy
    // button, no marketing copy. Past buyers use their Library instead.
    if (!isDigitalProductsLive()) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-900">
            {digital.title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Sales of this product are paused while it goes through an
            independent review. If you already bought it, it stays in
            your Library — your access is unchanged.
          </p>
        </div>
      );
    }
    return <DigitalProductDetail product={digital} locale={locale} />;
  }

  const t = await getTranslations({ locale, namespace: 'Products' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const product = await getProduct(id);
  if (!product) {
    notFound();
  }

  // Seller display name (public).
  const { data: seller } = await supabase
    .from('providers')
    .select('business_name, country')
    .eq('id', product.provider_id)
    .maybeSingle();
  const sellerName =
    (seller as { business_name?: string } | null)?.business_name ?? t('soldBy');

  const currency = currencyForCountry(
    (seller as { country?: string | null } | null)?.country ?? 'CA'
  );
  const stripeReady = isStripeConfigured();

  // Signed-in state for the report button (reporting requires an account).
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link
        href={localizedPath('/discover', locale)}
        className="text-sm font-semibold text-brand-600 hover:underline"
      >
        ← {t('shopTitle')}
      </Link>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          {product.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-full rounded-2xl object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-brand-100 text-6xl">
              📦
            </div>
          )}
          {product.images.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {product.images.slice(1, 5).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-20 w-full rounded-xl object-cover"
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-brand-900">{product.name}</h1>
          <p className="text-sm text-brand-600">
            {t('soldBy')}: {sellerName}
          </p>
          <p className="text-3xl font-bold text-brand-700">
            {formatCurrency(product.price_cents, currency, locale)}
          </p>
          <p className="text-sm font-semibold text-green-700">
            {product.stock === -1 || product.stock > 0 ? t('inStock') : t('outOfStock')}
          </p>
          {product.description && (
            <Panel>
              <p className="whitespace-pre-line text-brand-800">{product.description}</p>
            </Panel>
          )}
          {isProviderShopLive() && stripeReady && (product.stock === -1 || product.stock > 0) ? (
            <ProductBuyButton
              productId={product.id}
              unitPriceCents={product.price_cents}
              currency={currency}
            />
          ) : null}
          {!isProviderShopLive() ? (
            <p className="text-sm font-semibold text-brand-800">
              This item is sold by the provider — contact them directly to buy.
            </p>
          ) : null}
          <div className="mt-4">
            <AffiliateNote locale={locale} variant="prominent" />
          </div>
        </div>
      </div>

      {/* Trust: report this product's seller if something looks wrong */}
      <div className="flex justify-center pt-2">
        <ReportButton providerId={product.provider_id} signedIn={!!viewer} />
      </div>
    </div>
  );
}
