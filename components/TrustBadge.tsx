import type { ReactNode } from 'react';

/**
 * Display trust levels (D3/D4, Oct 30 2026).
 * RETIRED: 'verified' and 'trusted' no longer exist as display tiers —
 * Zervia makes no verification claims about providers. Legacy values
 * (e.g. stored trust_level rows) are normalized to 'new' via
 * normalizeTrustLevel(). 'top_rated' is a pure rating fact
 * (4.8+ stars, 20+ reviews from completed bookings).
 */
export type TrustLevel = 'new' | 'top_rated';

/**
 * Map any stored/raw trust value to a display level.
 * Anything that is not 'top_rated' renders as 'new'.
 */
export function normalizeTrustLevel(level: string | null | undefined): TrustLevel {
  return level === 'top_rated' ? 'top_rated' : 'new';
}

type TrustBadgeProps = {
  /** Provider's display level (use normalizeTrustLevel for stored values). */
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
  top_rated: {
    label: 'Top Rated',
    cls: 'bg-amber-50 text-amber-800 border-amber-300',
    icon: '⭐',
  },
};

/**
 * Provider rating chip: the visual face of the provider's review record.
 * Shows the rating tier plus rating and completed-job stats when the full
 * variant is used. Reviews behind these numbers come exclusively from
 * completed bookings (enforced by DB trigger). Never a verification claim.
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
      title="Provider rating — based on completed bookings only"
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
