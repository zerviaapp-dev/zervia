import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/components/provider/OnboardingWizard';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countries } from '@/lib/countries';
import { defaultLocale, type Locale } from '@/lib/locales';

/**
 * Provider onboarding wizard. Already a provider → dashboard.
 * Renders the "not connected" card until the founder's Supabase setup lands.
 */
export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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

  const { data: existing } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) {
    redirect(localizedPath('/app/provider', locale));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('country, preferred_locale')
    .eq('id', user.id)
    .single();

  return (
    <OnboardingWizard
      countries={countries}
      defaultCountry={profile?.country ?? 'CA'}
      defaultLocale={(profile?.preferred_locale as Locale) ?? defaultLocale}
    />
  );
}
