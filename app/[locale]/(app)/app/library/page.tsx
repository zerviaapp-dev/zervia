import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { getDigitalProduct } from '@/lib/digital-products';

type Entitlement = {
  id: string;
  product_slug: string;
  purchased_at: string;
};

/**
 * Customer's digital library: every digital product they've purchased,
 * with download/access links. Entitlements are written by the Stripe
 * webhook on checkout.session.completed (zervia_kind=digital_product_order).
 */
export default async function LibraryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Library' });
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

  let entitlements: Entitlement[] = [];
  try {
    const { data, error } = await supabase
      .from('digital_entitlements')
      .select('id, product_slug, purchased_at')
      .eq('user_id', user.id)
      .order('purchased_at', { ascending: false });
    if (error) throw error;
    entitlements = (data ?? []) as Entitlement[];
  } catch {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Panel>
          <p className="text-brand-800">{t('errorLoading')}</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
      <p className="text-brand-700">{t('subtitle')}</p>

      {entitlements.length === 0 ? (
        <Panel>
          <p className="text-brand-800">{t('empty')}</p>
          <Link
            href={localizedPath('/products', locale)}
            className="mt-4 inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
          >
            {t('browseProducts')}
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {entitlements.map((ent) => {
            const product = getDigitalProduct(ent.product_slug);
            return (
              <Panel key={ent.id}>
                <h2 className="text-lg font-semibold text-brand-900">
                  {product?.title ?? ent.product_slug}
                </h2>
                <p className="mt-1 text-sm text-brand-600">
                  {t('purchasedOn')}:{' '}
                  {new Date(ent.purchased_at).toLocaleDateString(locale)}
                </p>
                {product && (
                  <Link
                    href={localizedPath(`/products/${product.slug}`, locale)}
                    className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    {t('viewProduct')}
                  </Link>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
