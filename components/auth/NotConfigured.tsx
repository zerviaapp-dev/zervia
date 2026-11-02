import { useTranslations } from 'next-intl';
import { ZMark } from '@/components/ZMark';

/**
 * Friendly "database not connected yet" card. Rendered anywhere auth data
 * is needed before the founder completes the 10-minute Supabase setup —
 * the app never crashes, it explains.
 */
export function NotConfigured() {
  const t = useTranslations('Auth');
  return (
    <div className="mx-auto w-full max-w-md rounded-3xl bg-white p-8 text-center shadow">
      <div className="mx-auto mb-4 w-fit">
        <ZMark />
      </div>
      <h1 className="text-2xl font-bold text-brand-900">
        {t('notConfiguredTitle')}
      </h1>
      <p className="mt-3 text-base text-brand-800">{t('notConfiguredText')}</p>
    </div>
  );
}
