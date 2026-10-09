import type { ReactNode } from 'react';

export type TrustLevel = 'new' | 'verified' | 'trusted' | 'top_rated';

type TrustBadgeProps = {
  /** Provider's trust level from the trust framework. */
  level: TrustLevel;
  /** Average rating 0–5 (from completed-booking reviews only). */
  ratingAvg?: number | null;
  /** Number of reviews. */
  reviewCount?: number | null;
  /** Completed jobs count. */
  completedJobs?: number | null;
  /** 'compact' = badge chip only; 'full' = badge + stats row. */
  variant?: 'compact' | 'full';
  className?: string;
};

const LEVEL_STYLE: Record<TrustLevel, { label: string; cls: string; icon: ReactNode }> = {
  new: {
    label: 'New',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: '🌱',
  },
  verified: {
    label: 'Verified',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: '✓',
  },
  trusted: {
    label: 'Trusted',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: '🛡️',
  },
  top_rated: {
    label: 'Top Rated',
    cls: 'bg-amber-50 text-amber-800 border-amber-300',
    icon: '⭐',
  },
};

/**
 * Trust badge: the visual face of Phase 1 trust foundation.
 * Shows the provider's trust tier, plus rating and completed-job stats
 * when the full variant is used. Reviews behind these numbers come
 * exclusively from completed bookings (enforced by DB trigger).
 */
export function TrustBadge({
  level,
  ratingAvg,
  reviewCount,
  completedJobs,
  variant = 'compact',
  className = '',
}: TrustBadgeProps) {
  const style = LEVEL_STYLE[level] ?? LEVEL_STYLE.new;
  const chip = (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${style.cls} ${className}`}
      title="Trust tier: earned through verified identity and completed jobs"
    >
      <span aria-hidden="true">{style.icon}</span>
      {style.label}
    </span>
  );

  if (variant === 'compact') {
    return chip;
  }

  const rating = ratingAvg != null && ratingAvg > 0 ? Number(ratingAvg).toFixed(1) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {chip}
      {rating && (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-900">
          <span aria-hidden="true">⭐</span>
          {rating}
          {reviewCount != null && reviewCount > 0 && (
            <span className="font-normal text-brand-600">({reviewCount})</span>
          )}
          <span className="sr-only">average rating from completed bookings</span>
        </span>
      )}
      {completedJobs != null && completedJobs > 0 && (
        <span className="text-sm text-brand-600">
          {completedJobs} {completedJobs === 1 ? 'job' : 'jobs'} done
        </span>
      )}
    </div>
  );
}
