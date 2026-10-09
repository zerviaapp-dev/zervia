import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ListingForm, type ListingDefaults } from '@/components/provider/ListingForm';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countries } from '@/lib/countries';

/** New listing for the caller's own provider row. */
export default async function NewListingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
    .select('id, country, city, category')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!provider) {
    redirect(localizedPath('/app/provider', locale));
  }

  const defaults: ListingDefaults = {
    title: '',
    description: '',
    category: provider.category ?? 'cleaning',
    subcategory: '',
    price: '',
    priceType: 'quote',
    country: provider.country ?? 'CA',
    city: provider.city ?? '',
    status: 'draft',
    photos: [],
  };

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('newListingTitle')}</h1>
      <ListingForm defaults={defaults} countries={countries} isEdit={false} />
    </div>
  );
}
