import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { ListingForm, type ListingDefaults } from '@/components/provider/ListingForm';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countries } from '@/lib/countries';
import { centsToInput } from '@/lib/money';
import type { PriceType } from '@/lib/categories';

type ListingRow = {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price_cents: number | null;
  price_type: string;
  country: string;
  city: string | null;
  status: string;
  photos: unknown;
};

/** Edit one of the caller's own listings (ownership enforced by RLS). */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
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

  const { data: listing } = (await supabase
    .from('listings')
    .select(
      'id, provider_id, title, description, category, subcategory, price_cents, price_type, country, city, status, photos'
    )
    .eq('id', id)
    .maybeSingle()) as { data: ListingRow | null };

  // RLS already hides other providers' listings; this is defence in depth.
  if (!listing || listing.provider_id !== provider.id) {
    notFound();
  }

  const defaults: ListingDefaults = {
    id: listing.id,
    title: listing.title,
    description: listing.description ?? '',
    category: listing.category,
    subcategory: listing.subcategory ?? '',
    price: centsToInput(listing.price_cents),
    priceType: listing.price_type as PriceType,
    country: listing.country,
    city: listing.city ?? '',
    status: listing.status,
    photos: Array.isArray(listing.photos) ? (listing.photos as string[]) : [],
  };

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('editListingTitle')}</h1>
      <ListingForm defaults={defaults} countries={countries} isEdit />
    </div>
  );
}
