import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { OnboardingWizard } from '@/components/provider/OnboardingWizard';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countries } from '@/lib/countries';
import { defaultLocale, type Locale } from '@/lib/locales';

/**
 * Provider onboarding wizard. Already a provider → dashboard.
 * Renders the "not connected" card until the founder's Supabase setup lands.
 * Shows a founding-provider welcome banner for users who signed up with
 * provider intent (is_provider in their auth metadata).
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

  // Founding-provider welcome: shown when the user signed up via the
  // provider path (?type=provider or the "offer services" checkbox).
  const signedUpAsProvider =
    (user.user_metadata as Record<string, unknown> | null)?.is_provider ===
    true;
  const t = await getTranslations({ locale, namespace: 'Provider' });

  return (
    <div className="space-y-6">
      {signedUpAsProvider ? (
        <div
          role="status"
          className="rounded-2xl border-2 border-brand-200 bg-brand-50 px-5 py-4"
        >
          <p className="text-lg font-bold text-brand-900">
            {t('foundingWelcomeTitle')}
          </p>
          <p className="mt-1 text-base text-brand-800">
            {t('foundingWelcomeText')}
          </p>
        </div>
      ) : null}
      <OnboardingWizard
        countries={countries}
        defaultCountry={profile?.country ?? 'CA'}
        defaultLocale={(profile?.preferred_locale as Locale) ?? defaultLocale}
      />
    </div>
  );
}
