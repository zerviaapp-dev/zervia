import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { locales, defaultLocale } from '@/lib/locales';

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale,
  // Default locale has no prefix: "/" is English, "/tl" is Tagalog, etc.
  localePrefix: 'as-needed',
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
