import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { formatListingPrice, currencyForCountry, formatCurrency } from '@/lib/currency';
import { getMyProducts } from '@/lib/supabase/product-actions';
import { ProductRowActions } from '@/components/provider/ProductRowActions';

/**
 * Provider "My Products" — list the caller's shop products with
 * price editing, active toggling, and delete. Adding products happens
 * on the /search subpage (CJ catalog search).
 */
export default async function ProviderProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Products' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizedPath('/login', locale));
  }

  const { data: provider } = await supabase
    .from('providers')
    .select('id, country')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!provider) {
    redirect(localizedPath('/app/provider', locale));
  }

  const products = await getMyProducts();
  const currency = currencyForCountry(
    (provider as { country?: string | null })?.country ?? 'CA'
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
          <p className="text-brand-700">{t('subtitle')}</p>
        </div>
        <Link
          href={localizedPath('/app/provider/products/search', locale)}
          className="rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
        >
          {t('addProduct')}
        </Link>
      </div>

      {products.length === 0 ? (
        <Panel>
          <p className="text-center text-brand-700">{t('noProducts')}</p>
          <div className="mt-4 text-center">
            <Link
              href={localizedPath('/app/provider/products/search', locale)}
              className="rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
            >
              {t('searchCj')}
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Panel key={p.id} className="flex flex-col gap-3">
              {p.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.images[0]}
                  alt={p.name}
                  className="h-40 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-40 w-full items-center justify-center rounded-xl bg-brand-100 text-4xl">
                  📦
                </div>
              )}
              <div>
                <h3 className="font-bold text-brand-900">{p.name}</h3>
                <p className="text-sm text-brand-600">
                  {formatCurrency(p.price_cents, currency, locale)} ·{' '}
                  {p.active ? t('activate') : t('deactivate')}
                </p>
              </div>
              <ProductRowActions product={p} locale={locale} />
            </Panel>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Link
          href={localizedPath('/app/provider', locale)}
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          ← {t('backToDashboard')}
        </Link>
      </div>
    </div>
  );
}
