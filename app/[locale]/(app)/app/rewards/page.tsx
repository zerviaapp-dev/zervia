import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { ShareButtons } from '@/components/rewards/ShareButtons';
import { RedeemBoost } from '@/components/rewards/RedeemBoost';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { defaultLocale } from '@/lib/locales';
import {
  getBalance,
  getLedger,
  getMyReferralCode,
  getMyReferrals,
} from '@/lib/supabase/rewards-actions';
import { BOOST_COST_POINTS } from '@/lib/rewards';
import { currencyForCountry, formatPointsValue } from '@/lib/currency';

const REASON_KEYS: Record<string, string> = {
  signup: 'reasonSignup',
  referral_given: 'reasonReferralGiven',
  referral_received: 'reasonReferralReceived',
  booking: 'reasonBooking',
  review: 'reasonReview',
  redemption: 'reasonRedemption',
  adjustment: 'reasonAdjustment',
};

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Rewards dashboard: balance, how-to-earn, invite section with share
 * buttons, referral list, points history, and boost redemption.
 * All figures come from the append-only ledger — balance is always SUM,
 * never a stored number.
 */
export default async function RewardsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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

  const [balance, ledger, code, referrals] = await Promise.all([
    getBalance(),
    getLedger(50),
    getMyReferralCode(),
    getMyReferrals(),
  ]);

  // The caller's own listings, for the boost-redemption picker.
  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  let listings: { id: string; title: string }[] = [];
  if (provider) {
    const { data } = await supabase
      .from('listings')
      .select('id, title')
      .eq('provider_id', (provider as { id: string }).id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);
    listings = (data ?? []) as { id: string; title: string }[];
  }

  const localePrefix = locale === defaultLocale ? '' : `/${locale}`;

  // Points have a fixed CAD value (100 pts = $1 CAD); show the cash
  // equivalent in the viewer's own currency.
  const { data: profile } = await supabase
    .from('profiles')
    .select('country')
    .eq('id', user.id)
    .single();
  const currency = currencyForCountry(
    (profile as { country?: string | null } | null)?.country
  );
  const balancePoints = balance ?? 0;

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>

      {/* Balance card */}
      <Panel>
        <p className="text-base font-semibold text-brand-700">
          {t('balanceTitle')}
        </p>
        <p className="mt-1 text-5xl font-bold text-brand-900">
          {balancePoints}
          <span className="ml-2 text-xl font-semibold text-brand-600">
            {t('pointsUnit')}
          </span>
        </p>
        <p className="mt-1 text-base font-semibold text-brand-700">
          {formatPointsValue(balancePoints, currency, locale)}
        </p>
        <p className="mt-2 text-base text-brand-800">{t('balanceSubtitle')}</p>
      </Panel>

      {/* How to earn */}
      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('howTitle')}</h2>
        <ul className="mt-3 space-y-2 text-base text-brand-800">
          <li className="flex justify-between gap-4">
            <span>{t('earnSignup')}</span>
            <span className="font-bold text-brand-700">+100</span>
          </li>
          <li className="flex justify-between gap-4">
            <span>{t('earnReferral')}</span>
            <span className="font-bold text-brand-700">+200</span>
          </li>
          <li className="flex justify-between gap-4">
            <span>{t('earnBooking')}</span>
            <span className="font-bold text-brand-700">+50</span>
          </li>
          <li className="flex justify-between gap-4">
            <span>{t('earnReview')}</span>
            <span className="font-bold text-brand-700">+25</span>
          </li>
        </ul>
        <p className="mt-3 text-sm text-brand-700">{t('earnMore')}</p>
      </Panel>

      {/* Invite friends */}
      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('referralTitle')}</h2>
        <p className="mt-2 text-base text-brand-800">{t('referralText')}</p>
        {code ? (
          <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-brand-700">{t('myCode')}</p>
            <p className="mt-1 text-3xl font-bold tracking-widest text-brand-900">
              {code}
            </p>
          </div>
        ) : null}
        <div className="mt-4">
          <ShareButtons code={code ?? ''} localePrefix={localePrefix} />
        </div>

        <h3 className="mt-6 text-lg font-bold text-brand-900">
          {t('myReferrals')}
        </h3>
        {referrals.length === 0 ? (
          <p className="mt-2 text-base text-brand-800">{t('noReferrals')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-brand-100">
            {referrals.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-4 py-2 text-base"
              >
                <span className="text-brand-800">
                  {r.referred_email ?? t('referralFriend')}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm text-brand-600">
                    {formatDate(r.created_at, locale)}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      r.status === 'redeemed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-brand-100 text-brand-700'
                    }`}
                  >
                    {r.status === 'redeemed'
                      ? t('referralRedeemed')
                      : t('referralSent')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Redeem for a boost */}
      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('redeemTitle')}</h2>
        <p className="mt-2 text-base text-brand-800">{t('redeemBoostText')}</p>
        <p className="mt-1 text-sm text-brand-700">{t('redeemPhase5Note')}</p>
        <div className="mt-4">
          <RedeemBoost
            listings={listings}
            balance={balance ?? 0}
            cost={BOOST_COST_POINTS}
            locale={locale}
          />
        </div>
      </Panel>

      {/* History */}
      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('historyTitle')}</h2>
        {ledger.length === 0 ? (
          <p className="mt-2 text-base text-brand-800">{t('emptyHistory')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-brand-100">
            {ledger.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 py-2 text-base"
              >
                <span className="text-brand-800">
                  {t(REASON_KEYS[row.reason] ?? 'reasonAdjustment')}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm text-brand-600">
                    {formatDate(row.created_at, locale)}
                  </span>
                  <span
                    className={`font-bold ${
                      row.points_delta > 0
                        ? 'text-green-700'
                        : 'text-brand-900'
                    }`}
                  >
                    {row.points_delta > 0 ? '+' : ''}
                    {row.points_delta}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
