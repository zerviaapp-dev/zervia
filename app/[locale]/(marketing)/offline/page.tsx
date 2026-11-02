import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

/**
 * Offline fallback page (PWA). The service worker serves this when the
 * network fails and nothing is cached. Static and translated — it must
 * render with zero network, so it uses only inlined critical styles via
 * Tailwind classes already in the cached CSS bundle.
 */
export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Policies' });

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-4xl" aria-hidden="true">
        📶
      </div>
      <h1 className="mt-4 text-3xl font-bold text-brand-900">{t('offlineTitle')}</h1>
      <p className="mt-2 text-base text-brand-700">{t('offlineBody')}</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
      >
        {t('offlineRetry')}
      </Link>
    </div>
  );
}
