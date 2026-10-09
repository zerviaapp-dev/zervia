import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ZMark } from '@/components/ZMark';

/**
 * Shared chrome for all public marketing pages (/, /discover, /pricing,
 * /terms, /privacy, /refunds, /listings/*).
 *
 * Sticky blurred brand header + minimal footer, consistent max-width
 * container. Individual pages render only their content — no more
 * inline headers/footers, no more pages that end abruptly.
 */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Home' });

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex min-h-[64px] w-full max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <ZMark size={36} />
            <span className="text-xl font-extrabold tracking-tight text-brand-900">
              Zervia
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-semibold">
            <Link
              href="/discover"
              className="inline-flex min-h-[44px] items-center rounded-full px-4 text-brand-700 hover:bg-brand-50"
            >
              {t('navDiscover')}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-[44px] items-center rounded-full px-4 text-brand-700 hover:bg-brand-50"
            >
              {t('navPricing')}
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 text-white hover:bg-brand-700"
            >
              {t('navSignIn')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-brand-100">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-5 py-8 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <ZMark size={28} />
            <p className="text-sm text-slate-500">{t('footerNote')}</p>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium text-brand-700">
            <Link href="/support" className="hover:underline">
              {t('footerSupport')}
            </Link>
            <Link href="/terms" className="hover:underline">
              {t('footerTerms')}
            </Link>
            <Link href="/privacy" className="hover:underline">
              {t('footerPrivacy')}
            </Link>
            <Link href="/refunds" className="hover:underline">
              {t('footerRefunds')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
