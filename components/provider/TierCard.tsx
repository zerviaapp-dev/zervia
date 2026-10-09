import { useTranslations } from 'next-intl';
import { Panel } from '@/components/Panel';
import {
  tierFor,
  tierProgress,
  type TrustLevel,
} from '@/lib/tiers';

const TIER_STYLES: Record<TrustLevel, string> = {
  new: 'bg-brand-100 text-brand-700',
  verified: 'bg-emerald-100 text-emerald-800',
  trusted: 'bg-blue-100 text-blue-800',
  top_rated: 'bg-amber-100 text-amber-800',
};

const TIER_ICONS: Record<TrustLevel, string> = {
  new: '🌱',
  verified: '🚀',
  trusted: '🏅',
  top_rated: '⭐',
};

/**
 * Growth-tier card for the provider dashboard: current tier badge,
 * progress bar toward the next tier, and the tier's perks.
 */
export function TierCard({
  trustLevel,
  completedJobs,
}: {
  trustLevel: TrustLevel;
  completedJobs: number;
}) {
  const t = useTranslations('Tiers');
  const tier = tierFor(trustLevel);
  const { next, progress, jobsToGo } = tierProgress(trustLevel, completedJobs);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-600">
            {t('yourTier')}
          </p>
          <p
            className={`mt-1 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-lg font-bold ${TIER_STYLES[tier.level]}`}
          >
            <span aria-hidden="true">{TIER_ICONS[tier.level]}</span>
            {t(tier.nameKey)}
          </p>
          <p className="mt-2 text-base text-brand-800">{t(tier.descKey)}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-brand-900">{completedJobs}</p>
          <p className="text-sm text-brand-600">{t('jobsDone')}</p>
        </div>
      </div>

      {next ? (
        <div className="mt-4">
          <div
            className="h-3 overflow-hidden rounded-full bg-brand-100"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('progressToNext', { tier: t(next.nameKey) })}
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-medium text-brand-700">
            {t('jobsToNext', { count: jobsToGo, tier: t(next.nameKey) })}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm font-semibold text-amber-700">
          {t('maxTier')}
        </p>
      )}

      <div className="mt-4 border-t border-brand-100 pt-3">
        <p className="text-sm font-semibold text-brand-900">{t('yourPerks')}</p>
        <ul className="mt-2 space-y-1">
          {tier.perkKeys.map((key) => (
            <li key={key} className="flex items-start gap-2 text-base text-brand-800">
              <span aria-hidden="true" className="text-emerald-600">✓</span>
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
