import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { GuidedListingWizard } from '@/components/provider/GuidedListingWizard';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

/** Guided listing creation: answer 5 questions → smart draft → edit → publish. */
export default async function GuidedListingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Tiers' });
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
    .select('id, country, city, category')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!provider) {
    redirect(localizedPath('/app/provider', locale));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">
          {t('wizardTitle')}
        </h1>
        <p className="mt-1 text-lg text-brand-700">{t('wizardSubtitle')}</p>
      </div>
      <GuidedListingWizard
        locale={locale}
        defaultCountry={provider.country ?? 'CA'}
        defaultCity={provider.city ?? ''}
        defaultCategory={provider.category ?? 'cleaning'}
      />
    </div>
  );
}
