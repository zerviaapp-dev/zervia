export const locales = [
  'en',
  'tl',
  'es',
  'fr',
  'yo',
  'ig',
  'ha',
  'zh',
  'ar',
  'pt',
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/** Locales that read right-to-left. */
export const rtlLocales: readonly Locale[] = ['ar'];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  tl: 'Tagalog',
  es: 'Español',
  fr: 'Français',
  yo: 'Yorùbá',
  ig: 'Igbo',
  ha: 'Hausa',
  zh: '中文',
  ar: 'العربية',
  pt: 'Português',
};

export function isRtl(locale: Locale): boolean {
  return (rtlLocales as readonly string[]).includes(locale);
}
