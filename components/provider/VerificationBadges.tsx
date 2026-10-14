'use client';

import { BADGE_META, type BadgeKey } from '@/lib/provider-badges';

/**
 * Verification badge pills for provider cards and profiles.
 *
 * Renders up to `max` badges; overflow collapses to "+N more".
 * Each badge shows an icon + label with a native tooltip (title)
 * explaining what the badge means. Fully accessible via title text.
 *
 * Props:
 * - badges: earned badge keys (from getProviderBadges)
 * - labels: localized label per badge key
 * - hints: localized tooltip description per badge key
 * - max: max badges shown before "+N more" (default 3)
 * - size: 'sm' | 'md'
 */
export function VerificationBadges({
  badges,
  labels,
  hints,
  max = 3,
  size = 'sm',
}: {
  badges: BadgeKey[];
  labels: Record<BadgeKey, string>;
  hints: Record<BadgeKey, string>;
  max?: number;
  size?: 'sm' | 'md';
}) {
  if (!badges || badges.length === 0) return null;

  const shown = badges.slice(0, max);
  const overflow = badges.length - shown.length;

  const sizeClass = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';

  return (
    <span className="inline-flex flex-wrap items-center gap-1" role="list" aria-label="Verification badges">
      {shown.map((key) => {
        const meta = BADGE_META[key];
        if (!meta) return null;
        return (
          <span
            key={key}
            role="listitem"
            title={hints[key] ?? labels[key] ?? key}
            className={`inline-flex cursor-help items-center gap-1 rounded-full font-semibold ${meta.className} ${sizeClass}`}
          >
            <span aria-hidden="true">{meta.icon}</span>
            <span>{labels[key] ?? key}</span>
          </span>
        );
      })}
      {overflow > 0 ? (
        <span
          role="listitem"
          title={shown.map((k) => labels[k]).join(', ')}
          className={`inline-flex items-center rounded-full bg-brand-100 font-semibold text-brand-700 ${sizeClass}`}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
