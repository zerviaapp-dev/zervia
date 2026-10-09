import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

/**
 * Hero "Get started" button — links to the live signup page.
 * Locale-aware via next-intl routing. Large 56px tap target.
 */
export function GetStartedButton() {
  const t = useTranslations('Home');

  return (
    <Link
      href="/signup"
      className={
        'inline-flex min-h-[56px] items-center justify-center rounded-full px-8 py-4 ' +
        'bg-brand-600 text-lg font-semibold text-white transition-colors ' +
        'hover:bg-brand-700 active:bg-brand-800 ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600'
      }
    >
      {t('getStarted')}
    </Link>
  );
}
