import { getTranslations } from 'next-intl/server';
import { isAuditBadgeValid } from '@/lib/pricing';

/**
 * 🏅 Audited badge — earned by passing a random quality audit.
 * Distinct from the green ✓ verification badge (ID check). Renders
 * nothing when the provider has no valid badge (expired or never earned).
 *
 * Server component; `auditedUntil` comes from `providers.audited_until`
 * (set to now + 6 months on a "pass" verdict, cleared otherwise).
 */
export async function AuditedBadge({
  auditedUntil,
  locale,
  size = 'sm',
}: {
  auditedUntil: string | null | undefined;
  locale: string;
  size?: 'sm' | 'md';
}) {
  if (!isAuditBadgeValid(auditedUntil)) return null;
  const t = await getTranslations({ locale, namespace: 'Provider' });
  return (
    <span
      title={t('auditedBadgeHint')}
      className={`inline-flex items-center rounded-full bg-amber-100 font-bold text-amber-800 ${
        size === 'md' ? 'px-3 py-0.5 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
      🏅 {t('auditedBadge')}
    </span>
  );
}
