import { Link } from '@/i18n/routing';
import { locales, localeNames, type Locale } from '@/lib/locales';

type LanguageSwitcherProps = {
  current: Locale;
};

/** All 10 launch languages, linking to the homepage in each locale. */
export function LanguageSwitcher({ current }: LanguageSwitcherProps) {
  return (
    <nav aria-label="Language">
      <ul className="flex flex-wrap justify-center gap-2">
        {locales.map((locale) => {
          const active = locale === current;
          return (
            <li key={locale}>
              <Link
                href="/"
                locale={locale}
                aria-current={active ? 'true' : undefined}
                className={
                  'inline-block rounded-full px-4 py-2 text-sm font-semibold transition-colors ' +
                  (active
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50')
                }
              >
                {localeNames[locale]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
