import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AliExpressSearch } from '@/components/provider/AliExpressSearch';
import { Import1688Form } from '@/components/provider/Import1688Form';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

/**
 * Provider product sourcing: search AliExpress catalog or import from a
 * 1688.com URL, then add products to the provider's Zervia shop.
 * Provider-only; sourcing runs server-side.
 */
export default async function ProductSourcingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Provider' });
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

  const activeTab = tab === '1688' ? '1688' : 'aliexpress';
  const tabLink = (name: string) =>
    `${localizedPath('/app/provider/sourcing', locale)}?tab=${name}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">
          {t('sourcingTitle')}
        </h1>
        <p className="mt-1 text-base text-brand-700">{t('sourcingSubtitle')}</p>
      </div>

      <div className="flex gap-2">
        <a
          href={tabLink('aliexpress')}
          className={`inline-flex min-h-[48px] items-center rounded-full px-6 text-base font-semibold ${
            activeTab === 'aliexpress'
              ? 'bg-brand-600 text-white'
              : 'border-2 border-brand-200 bg-white text-brand-700 hover:border-brand-400'
          }`}
        >
          🛒 {t('sourcingTabAliExpress')}
        </a>
        <a
          href={tabLink('1688')}
          className={`inline-flex min-h-[48px] items-center rounded-full px-6 text-base font-semibold ${
            activeTab === '1688'
              ? 'bg-brand-600 text-white'
              : 'border-2 border-brand-200 bg-white text-brand-700 hover:border-brand-400'
          }`}
        >
          🏭 {t('sourcingTab1688')}
        </a>
      </div>

      <Panel>
        {activeTab === 'aliexpress' ? (
          <>
            <h2 className="text-lg font-bold text-brand-900">
              {t('sourcingTabAliExpress')}
            </h2>
            <p className="mt-1 text-sm text-brand-700">
              {t('sourcingAliExpressHint')}
            </p>
            <div className="mt-4">
              <AliExpressSearch locale={locale} />
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-brand-900">
              {t('sourcingTab1688')}
            </h2>
            <p className="mt-1 text-sm text-brand-700">
              {t('sourcing1688Hint')}
            </p>
            <div className="mt-4">
              <Import1688Form locale={locale} />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
