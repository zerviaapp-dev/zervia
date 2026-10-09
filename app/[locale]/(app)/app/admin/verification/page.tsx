import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { VerificationQueueActions } from '@/components/verification/VerificationQueueActions';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

type QueueItem = {
  id: string;
  provider_id: string;
  doc_type: string;
  storage_path: string;
  status: string;
  created_at: string;
  providers: {
    business_name: string;
    trust_level: string;
    profiles: { full_name: string; email: string } | null;
  } | null;
};

/**
 * Admin-only verification review queue. Documents live in the private
 * `verification-docs` bucket; admins view them via signed URLs generated
 * server-side (never exposed publicly).
 */
export default async function AdminVerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Trust' });
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
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    redirect(localizedPath('/app/dashboard', locale));
  }

  const { data } = (await supabase
    .from('verification_documents')
    .select(
      'id, provider_id, doc_type, storage_path, status, created_at, providers!inner(business_name, trust_level, profiles!providers_user_id_fkey(full_name, email))'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })) as { data: QueueItem[] | null };

  const queue = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/app/admin/providers"
          className="inline-flex min-h-[44px] items-center text-base font-semibold text-brand-700"
        >
          ← {t('backToProviders')}
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-900">{t('queueTitle')}</h1>
        <p className="mt-1 text-base text-brand-700">{t('queueSubtitle')}</p>
      </div>

      {queue.length === 0 ? (
        <Panel>
          <p className="py-4 text-center text-base text-brand-700">{t('queueEmpty')}</p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {queue.map((item) => (
            <li key={item.id}>
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-brand-900">
                      {item.providers?.business_name ?? t('unknownProvider')}
                    </p>
                    <p className="text-sm text-brand-700">
                      {item.providers?.profiles?.full_name} · {item.providers?.profiles?.email}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-brand-800">
                      {t(`docType_${item.doc_type}`)}
                    </p>
                    <p className="text-xs text-brand-600">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                    {t('status_pending')}
                  </span>
                </div>
                <div className="mt-4">
                  <VerificationQueueActions docId={item.id} locale={locale} />
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
