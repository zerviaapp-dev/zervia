import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import {
  getReferralLeaderboard,
  type LeaderboardPeriod,
} from '@/lib/supabase/rewards-actions';

const PERIODS: LeaderboardPeriod[] = ['week', 'month', 'all'];

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Referral leaderboard: top-10 referrers by period, with anonymized
 * display names. Data comes from the SECURITY DEFINER function in
 * migration 0028 (cross-user aggregates RLS would otherwise block).
 */
export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const { period: rawPeriod } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Rewards' });
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

  const period: LeaderboardPeriod = PERIODS.includes(
    rawPeriod as LeaderboardPeriod
  )
    ? (rawPeriod as LeaderboardPeriod)
    : 'week';

  const leaders = await getReferralLeaderboard(period);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/app/rewards"
          className="text-base font-semibold text-brand-600 hover:text-brand-800"
        >
          ← {t('backToRewards')}
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-900">
          {t('leaderboardTitle')}
        </h1>
        <p className="mt-1 text-base text-brand-800">
          {t('leaderboardSubtitle')}
        </p>
      </div>

      {/* Period tabs */}
      <div
        role="tablist"
        aria-label={t('leaderboardPeriod')}
        className="flex gap-2"
      >
        {PERIODS.map((p) => {
          const active = p === period;
          return (
            <Link
              key={p}
              role="tab"
              aria-selected={active}
              href={`/app/rewards/leaderboard?period=${p}`}
              className={`inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full px-4 text-base font-semibold ${
                active
                  ? 'bg-brand-600 text-white'
                  : 'border-2 border-brand-600 bg-white text-brand-700 hover:bg-brand-50'
              }`}
            >
              {t(`leaderboard_${p}`)}
            </Link>
          );
        })}
      </div>

      <Panel>
        {leaders.length === 0 ? (
          <p className="text-base text-brand-800">{t('leaderboardEmpty')}</p>
        ) : (
          <ol className="divide-y divide-brand-100">
            {leaders.map((row, i) => (
              <li
                key={`${row.rank}-${i}`}
                className="flex items-center gap-4 py-3"
              >
                <span
                  className="w-10 shrink-0 text-center text-2xl font-bold text-brand-900"
                  aria-hidden="true"
                >
                  {MEDALS[i] ?? row.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-brand-900">
                    {row.display_name}
                  </span>
                  <span className="block text-sm text-brand-600">
                    {t('leaderboardReferrals', { count: row.referral_count })}
                    {' · '}
                    {t('leaderboardRedeemed', { count: row.redeemed_count })}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">
                  #{row.rank}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-sm text-brand-700">{t('leaderboardPrivacy')}</p>
      </Panel>

      {/* CTA: invite more */}
      <Panel className="bg-brand-50">
        <h2 className="text-xl font-bold text-brand-900">
          {t('leaderboardCtaTitle')}
        </h2>
        <p className="mt-1 text-base text-brand-800">
          {t('leaderboardCtaText')}
        </p>
        <Link
          href="/app/rewards"
          className="mt-4 inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
        >
          {t('leaderboardCtaButton')}
        </Link>
      </Panel>
    </div>
  );
}
