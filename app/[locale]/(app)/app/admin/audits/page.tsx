import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { DataLoadError } from '@/components/admin/DataLoadError';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { assertCeo } from '@/lib/supabase/ceo-actions';
import {
  runRandomAudit,
  setAuditStatus,
  getLatestAuditBatch,
  getAuditHistory,
} from '@/lib/supabase/audit-actions';
import { auditStatusLabel } from '@/lib/audit';

/**
 * CEO/admin random provider quality audits.
 *
 * IMPORTANT — audits never touch Stripe: they are quality checks only.
 * No audit charges, refunds, holds, or moves money. The only money
 * effect is the automatic fee discount granted when the CEO marks a
 * provider "pass" (🏅 Audited badge + 8% free / 4% member for 6 months),
 * applied by the platform-fee engine on future bookings.
 *
 * Defence in depth: middleware redirects non-admins away from
 * /app/admin/* AND this page re-checks via assertCeo() server-side.
 */

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-700';
  if (score >= 50) return 'text-amber-700';
  return 'text-red-700';
}

function verdictBadge(status: string): string {
  switch (status) {
    case 'pass':
      return 'bg-green-100 text-green-800';
    case 'warning':
      return 'bg-amber-100 text-amber-800';
    case 'suspended':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-brand-100 text-brand-700';
  }
}

const CHECK_LABELS = [
  ['profile', 'Profile'],
  ['responseTime', 'Response'],
  ['reviews', 'Reviews'],
  ['completion', 'Completion'],
  ['verification', 'ID check'],
  ['complaints', 'Complaints'],
] as const;

export default async function AdminAuditsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Audit' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }
  if (!(await assertCeo())) {
    redirect(localizedPath('/app/dashboard', locale));
  }

  let latest: Awaited<ReturnType<typeof getLatestAuditBatch>> = [];
  let history: Awaited<ReturnType<typeof getAuditHistory>> = [];
  let loadError = false;
  try {
    latest = await getLatestAuditBatch();
    history = await getAuditHistory(30);
  } catch (e) {
    console.error('[admin/audits] failed to load audit data:', e);
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
        <DataLoadError />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
          <p className="mt-1 text-base text-brand-700">{t('subtitle')}</p>
        </div>
        <Link
          href="/app/admin/providers"
          className="inline-flex min-h-[48px] items-center rounded-full border-2 border-brand-600 bg-white px-6 text-base font-semibold text-brand-700"
        >
          ← {t('backToProviders')}
        </Link>
      </div>

      {/* Stripe disclaimer — audits are quality checks only. */}
      <div className="rounded-3xl border-2 border-brand-200 bg-brand-50 p-5">
        <p className="text-base font-bold text-brand-900">🔒 {t('noStripeTitle')}</p>
        <p className="mt-1 text-sm text-brand-800">{t('noStripeBody')}</p>
      </div>

      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('runTitle')}</h2>
        <p className="mt-1 text-sm text-brand-700">{t('runBody')}</p>
        <form action={runRandomAudit} className="mt-4 max-w-sm">
          <input type="hidden" name="locale" value={locale} />
          <SubmitButton>{t('runButton')}</SubmitButton>
        </form>
      </Panel>

      {/* Latest batch results */}
      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('resultsTitle')}</h2>
        {latest.length === 0 ? (
          <p className="mt-2 text-base text-brand-700">{t('noResults')}</p>
        ) : (
          <div className="mt-4 space-y-4">
            {latest.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl border border-brand-100 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-bold text-brand-900">
                    {a.provider?.business_name ?? a.provider_id}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-black ${scoreColor(a.score)}`}>
                      {a.score}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${verdictBadge(a.status)}`}
                    >
                      {a.status === 'pending'
                        ? `${t('suggested')}: ${auditStatusLabel(a.suggested)}`
                        : auditStatusLabel(a.status)}
                    </span>
                  </div>
                </div>

                {/* Score breakdown */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CHECK_LABELS.map(([key, label]) => {
                    const c = a.breakdown?.[key] as
                      | { score: number; detail: string }
                      | undefined;
                    if (!c) return null;
                    return (
                      <div
                        key={key}
                        className="rounded-xl bg-brand-50 px-3 py-2"
                        title={c.detail}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                          {label}
                        </p>
                        <p className={`text-lg font-bold ${scoreColor(c.score)}`}>
                          {c.score}
                        </p>
                        <p className="truncate text-xs text-brand-700">{c.detail}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Verdict actions */}
                {a.status === 'pending' ? (
                  <form action={setAuditStatus} className="mt-4 space-y-3">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="auditId" value={a.id} />
                    <textarea
                      name="note"
                      rows={2}
                      maxLength={2000}
                      placeholder={t('notePlaceholder')}
                      className="w-full rounded-2xl border-2 border-brand-100 px-4 py-3 text-base text-brand-900"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        name="verdict"
                        value="pass"
                        className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-green-600 px-6 text-base font-bold text-white hover:bg-green-700"
                      >
                        ✅ {t('verdictPass')}
                      </button>
                      <button
                        type="submit"
                        name="verdict"
                        value="warning"
                        className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-amber-500 px-6 text-base font-bold text-white hover:bg-amber-600"
                      >
                        ⚠️ {t('verdictWarning')}
                      </button>
                      <button
                        type="submit"
                        name="verdict"
                        value="suspended"
                        className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-red-600 px-6 text-base font-bold text-white hover:bg-red-700"
                      >
                        🔴 {t('verdictSuspend')}
                      </button>
                    </div>
                    <p className="text-xs text-brand-600">{t('passRewardHint')}</p>
                  </form>
                ) : (
                  <div className="mt-3">
                    <p className="text-sm text-brand-700">
                      <span className="font-semibold">{t('verdictLabel')}:</span>{' '}
                      {auditStatusLabel(a.status)}
                      {a.warning_deadline
                        ? ` · ${t('deadlineLabel')}: ${new Date(a.warning_deadline).toLocaleDateString()}`
                        : null}
                    </p>
                    {a.note ? (
                      <p className="mt-1 text-sm italic text-brand-700">“{a.note}”</p>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* History */}
      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('historyTitle')}</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-base text-brand-700">{t('noHistory')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-brand-500">
                  <th className="py-2 pr-4 font-semibold">{t('colDate')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('colProvider')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('colScore')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-brand-50">
                    <td className="py-2 pr-4 text-brand-700">
                      {new Date(h.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4 font-semibold text-brand-900">
                      {h.provider?.business_name ?? h.provider_id.slice(0, 8)}
                    </td>
                    <td className={`py-2 pr-4 font-bold ${scoreColor(h.score)}`}>
                      {h.score}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${verdictBadge(h.status)}`}
                      >
                        {auditStatusLabel(h.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
