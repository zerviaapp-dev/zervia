import { useTranslations } from 'next-intl';

/**
 * Friendly "data failed to load" card for admin dashboards.
 * Rendered when a Supabase query throws or returns an error —
 * the page shows this instead of crashing.
 */
export function DataLoadError() {
  const t = useTranslations('Auth');
  return (
    <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-5">
      <p className="text-base font-bold text-amber-900">⚠️ {t('errorGeneric')}</p>
    </div>
  );
}
