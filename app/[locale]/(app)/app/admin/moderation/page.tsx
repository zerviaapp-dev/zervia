import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { DataLoadError } from '@/components/admin/DataLoadError';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { dismissReport, actionReport } from '@/lib/supabase/moderation-actions';

type Report = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  listing_id: string | null;
  provider_id: string | null;
  listings: { title: string } | null;
  providers: { business_name: string } | null;
  reporter: { display_name: string } | null;
};

/**
 * Admin moderation queue: user-filed reports on listings/providers.
 * Defence in depth: middleware gates /app/admin/* AND this page re-checks
 * the admin role server-side. Actions pause the listing and/or flag the
 * provider — one click removes reported content from public view.
 */
export default async function AdminModerationPage({
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    redirect(localizedPath('/app/dashboard', locale));
  }

  let queue: Report[] = [];
  let loadError = false;
  try {
    const { data, error } = (await supabase
      .from('reports')
      .select(
        'id, reason, details, status, created_at, listing_id, provider_id, listings(title), providers(business_name), reporter:profiles!reports_reporter_id_fkey(display_name)'
      )
      .eq('status', 'open')
      .order('created_at', { ascending: true })) as {
      data: Report[] | null;
      error: unknown;
    };
    if (error) throw error;
    queue = data ?? [];
  } catch (e) {
    console.error('[admin/moderation] failed to load report queue:', e);
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-brand-900">{t('moderationTitle')}</h1>
        <DataLoadError />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('moderationTitle')}</h1>
      <p className="text-base text-brand-700">{t('moderationSubtitle')}</p>

      {queue.length === 0 ? (
        <Panel>
          <p className="text-base text-brand-700">{t('queueEmpty')}</p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {queue.map((report) => (
            <li key={report.id}>
              <Panel>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-800">
                    {t(`reason_${report.reason}`)}
                  </span>
                  <span className="text-sm text-brand-600">
                    {new Date(report.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-base font-semibold text-brand-900">
                  {report.listings?.title ?? report.providers?.business_name ?? t('unknownTarget')}
                </p>
                <p className="text-sm text-brand-700">
                  {t('reportedBy', { name: report.reporter?.display_name ?? t('unknownUser') })}
                </p>
                {report.details && (
                  <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
                    {report.details}
                  </p>
                )}

                <form
                  action={actionReport}
                  className="mt-4 flex flex-wrap items-center gap-4"
                >
                  <input type="hidden" name="reportId" value={report.id} />
                  {report.listing_id && (
                    <input type="hidden" name="listingId" value={report.listing_id} />
                  )}
                  {report.provider_id && (
                    <input type="hidden" name="providerId" value={report.provider_id} />
                  )}
                  {report.listing_id && (
                    <label className="flex min-h-[56px] cursor-pointer items-center gap-2 text-base text-brand-900">
                      <input type="checkbox" name="pauseListing" className="h-5 w-5 accent-brand-600" />
                      {t('actionPauseListing')}
                    </label>
                  )}
                  {report.provider_id && (
                    <label className="flex min-h-[56px] cursor-pointer items-center gap-2 text-base text-brand-900">
                      <input type="checkbox" name="flagProvider" className="h-5 w-5 accent-brand-600" />
                      {t('actionFlagProvider')}
                    </label>
                  )}
                  <button
                    type="submit"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-red-600 px-6 text-base font-semibold text-white hover:bg-red-700"
                  >
                    {t('actionTake')}
                  </button>
                </form>

                <form action={dismissReport} className="mt-2">
                  <input type="hidden" name="reportId" value={report.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700"
                  >
                    {t('actionDismiss')}
                  </button>
                </form>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
