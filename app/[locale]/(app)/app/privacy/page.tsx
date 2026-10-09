import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { PrivacyForm } from '@/components/moderation/PrivacyForm';

/**
 * In-app privacy center: exercise GDPR/PIPEDA rights (export / delete
 * my data). Requests land in the admin queue via `requestDataAction`.
 */
export default async function PrivacyCenterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Moderation' });
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

  const { data: pending } = await supabase
    .from('data_requests')
    .select('id, type, status, created_at')
    .eq('user_id', user.id)
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('privacyCenterTitle')}</h1>
      <p className="text-base text-brand-700">{t('privacyCenterBody')}</p>

      <Panel>
        <PrivacyForm />
      </Panel>

      {pending && pending.length > 0 && (
        <Panel>
          <h2 className="text-lg font-bold text-brand-900">{t('pendingRequests')}</h2>
          <ul className="mt-2 space-y-2">
            {pending.map((r: { id: string; type: string; status: string; created_at: string }) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-base text-brand-800">
                <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-800">
                  {r.type === 'deletion' ? t('dataRequestDeletion') : t('dataRequestExport')}
                </span>
                <span className="text-sm text-brand-600">
                  {r.status} · {new Date(r.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
