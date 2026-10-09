import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { isRtl, type Locale } from '@/lib/locales';
import { SWRegister } from '@/components/SWRegister';
import { InstallPrompt } from '@/components/InstallPrompt';
import { CookieBanner } from '@/components/CookieBanner';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const SITE_URL = 'https://zervia-app-deploy.vercel.app';

/** Per-locale SEO strings (short title/description — kept in code to avoid
 *  touching 10 locale message files for two strings). */
const SEO: Record<string, { title: string; description: string }> = {
  en: {
    title: 'Zervia — Anything and everything, in one place.',
    description:
      'Services, travel, learning, jobs, and rewards — one tap away, in your language.',
  },
  tl: {
    title: 'Zervia — Lahat ng kailangan mo, sa iisang lugar.',
    description:
      'Serbisyo, biyahe, pag-aaral, trabaho, at gantimpala — isang pindot lang, sa wika mo.',
  },
  es: {
    title: 'Zervia — Todo y más, en un solo lugar.',
    description:
      'Servicios, viajes, aprendizaje, empleos y recompensas — a un toque, en tu idioma.',
  },
  fr: {
    title: 'Zervia — Tout et plus, au même endroit.',
    description:
      'Services, voyages, apprentissage, emplois et récompenses — à portée de main, dans votre langue.',
  },
  yo: {
    title: 'Zervia — Ohun gbogbo, ní ibì kan.',
    description:
      'Iṣẹ́, ìrìn àjò, ẹ̀kọ́, iṣẹ́, àti ẹ̀san — ní ìfọwọ́kan kan, ní èdè rẹ.',
  },
  ig: {
    title: "Zervia — Ihe ọ bụla, n'otu ebe.",
    description:
      "Ọrụ, njem, mmụta, ọrụ, na ụgwọ ọrụ — n'otu mmetụ, n'asụsụ gị.",
  },
  ha: {
    title: 'Zervia — Komai da komai, a wuri ɗaya.',
    description:
      'Ayyuka, tafiya, koyo, ayyukan yi, da lada — a taɓa ɗaya, da harshenku.',
  },
  zh: {
    title: 'Zervia — 万事万物，一处搞定。',
    description: '服务、旅行、学习、工作和奖励——一触即达，用您的语言。',
  },
  ar: {
    title: 'زيرفيا — كل شيء وأكثر، في مكان واحد.',
    description: 'خدمات وسفر وتعلم ووظائف ومكافآت — بلمسة واحدة، بلغتك.',
  },
  pt: {
    title: 'Zervia — Tudo e mais, num só lugar.',
    description:
      'Serviços, viagens, aprendizado, empregos e recompensas — a um toque, no seu idioma.',
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = SEO[locale] ?? SEO.en;
  const url = locale === 'en' ? SITE_URL : `${SITE_URL}/${locale}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: seo.title,
    description: seo.description,
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { url: '/icon.svg', type: 'image/svg+xml' },
      ],
      apple: '/icon-192.png',
    },
    openGraph: {
      type: 'website',
      url,
      siteName: 'Zervia',
      title: seo.title,
      description: seo.description,
      locale,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Zervia — Anything and everything, in one place.',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description: seo.description,
      images: ['/og-image.png'],
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#0b5bd3',
  width: 'device-width',
  initialScale: 1,
};

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  // Arabic (and any future RTL locale) flips the whole layout.
  const dir = isRtl(locale as Locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SWRegister />
          <InstallPrompt />
          <CookieBanner />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
