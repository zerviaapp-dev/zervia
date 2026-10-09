import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { ProfileForm } from '@/components/auth/ProfileForm';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

/** Protected profile screen: view + edit name and country. */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Account' });
  const ts = await getTranslations({ locale, namespace: 'Support' });
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, country')
    .eq('id', user.id)
    .single();

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('profileTitle')}</h1>
      <Panel>
        <ProfileForm
          initialName={profile?.full_name ?? ''}
          initialCountry={profile?.country ?? ''}
          email={user.email ?? ''}
        />
      </Panel>

      {/* In-app route to support: logged-in users can reach help from here. */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-brand-900">
              {ts('contactTitle')}
            </h2>
            <p className="mt-1 text-base text-brand-800">
              {ts('contactSubtitle')}
            </p>
          </div>
          <Link
            href="/support"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
          >
            {ts('title')}
          </Link>
        </div>
      </Panel>
    </div>
  );
}
