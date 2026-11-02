import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { searchCjCatalog } from '@/lib/supabase/product-actions';
import { isCjConfigured } from '@/lib/cj-dropshipping';
import { CjAddToShopForm } from '@/components/provider/CjAddToShopForm';

/**
 * Provider "Add product" — search the CJ Dropshipping catalog and add
 * items to the shop with one tap. When CJ isn't connected, shows the
 * manual-fulfillment notice instead of results.
 */
export default async function ProductSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { q, page } = await searchParams;
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
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!provider) {
    redirect(localizedPath('/app/provider', locale));
  }

  const query = (q ?? '').trim();
  const pageNum = Math.max(1, Number(page) || 1);
  const search = query ? await searchCjCatalog(query, pageNum) : null;
  const cjConnected = isCjConfigured();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">{t('searchCj')}</h1>
        <p className="text-brand-700">{t('subtitle')}</p>
      </div>

      {!cjConnected && (
        <Panel className="border-amber-300 bg-amber-50">
          <p className="text-amber-800">{t('cjNotConnected')}</p>
        </Panel>
      )}

      <form
        action={localizedPath('/app/provider/products/search', locale)}
        method="get"
        className="flex gap-2"
      >
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t('searchPlaceholder')}
          className="min-h-[48px] w-full rounded-full border-2 border-brand-200 px-5"
        />
        <button
          type="submit"
          className="min-h-[48px] shrink-0 rounded-full bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
        >
          {t('searchButton')}
        </button>
      </form>

      {search && (
        <>
          {search.results.length === 0 ? (
            <Panel>
              <p className="text-center text-brand-700">{t('noResults')}</p>
            </Panel>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {search.results.map((item) => {
                const costUsd = item.sellPrice ?? 0;
                return (
                  <Panel key={item.pid} className="flex flex-col gap-3">
                    {item.productImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.productImage}
                        alt={item.productName}
                        className="h-40 w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center rounded-xl bg-brand-100 text-4xl">
                        📦
                      </div>
                    )}
                    <h3 className="line-clamp-2 font-bold text-brand-900">
                      {item.productName}
                    </h3>
                    <p className="text-sm text-brand-600">
                      {t('costPrice')}: ${costUsd.toFixed(2)} USD
                    </p>
                    <CjAddToShopForm item={item} />
                  </Panel>
                );
              })}
            </div>
          )}
        </>
      )}

      <Link
        href={localizedPath('/app/provider/products', locale)}
        className="text-sm font-semibold text-brand-600 hover:underline"
      >
        ← {t('title')}
      </Link>
    </div>
  );
}
