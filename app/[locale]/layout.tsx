import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { isRtl, type Locale } from '@/lib/locales';
import { SWRegister } from '@/components/SWRegister';
import { InstallPrompt } from '@/components/InstallPrompt';
import { CookieBanner } from '@/components/CookieBanner';
import { ToasterClient } from '@/components/ToasterClient';
import '../globals.css';

/** Inter — the Zervia display/body font. Loaded once, self-hosted by Next. */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const SITE_URL = 'https://zervia.app';

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
  // hreflang alternates for all 10 locales (prevents duplicate-content penalties)
  const languages: Record<string, string> = {};
  for (const l of Object.keys(SEO)) {
    languages[l] = l === 'en' ? SITE_URL : `${SITE_URL}/${l}`;
  }
  return {
    metadataBase: new URL(SITE_URL),
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: url,
      languages,
    },
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

/** Tidio chat widget — ZERVIA account key. Liz's REAL public key goes here
 *  (from her Tidio dashboard). Empty = widget stays off.
 *  NOTE: the Zervia account is separate from the FlexTravellers account —
 *  each site uses its own key. Never deploy with a guessed key. */
const TIDIO_KEY = 'nqfalsd9owoxqnmnd0eg47omuf2dlld4'; // ← Liz's Tidio public key for the ZERVIA account (sent by her Oct 19, ~8:00 AM MDT).

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
    <html lang={locale} dir={dir} className={inter.variable}>
      <head>
        {/* Tidio chat widget (Zervia account) — REVERSIBLE: delete this block to remove the widget.
            Renders nothing while TIDIO_KEY is empty; activate by pasting the key above. */}
        {TIDIO_KEY && (
          <>
            <script src={`https://code.tidio.co/${TIDIO_KEY}.js`} async />
            {/* Zervia brand color for the Tidio widget (#0b5bd3 = Zervia blue,
                per Liz Oct 19). Uses Tidio's documented setColorPalette API
                (developers.tidio.com/docs/widget-other-methods). The
                tidioChat-ready listener covers the case where the API script
                hasn't booted yet when this runs. NOTE: this code override wins
                over any color set in the Tidio dashboard — update here to change it. */}
            <script
              dangerouslySetInnerHTML={{
                __html: `(function () {
      var ZERVIA_BLUE = "#0b5bd3";
      function applyColor() {
        try { window.tidioChatApi.setColorPalette(ZERVIA_BLUE); } catch (e) {}
      }
      /* De-congestion (Oct 20 rev 2): while the chat panel is open,
         globals.css steps the cookie/install bars aside and un-shrinks
         the widget — driven by this class on <html>. */
      function markOpen() { document.documentElement.classList.add("tidio-chat-open"); }
      function markClosed() { document.documentElement.classList.remove("tidio-chat-open"); }
      function onReady() {
        applyColor();
        try {
          window.tidioChatApi.on("open", markOpen);
          window.tidioChatApi.on("close", markClosed);
        } catch (e) {}
      }
      if (window.tidioChatApi) {
        window.tidioChatApi.on("ready", onReady);
      } else {
        document.addEventListener("tidioChat-ready", onReady);
      }
    })();`,
              }}
            />
          </>
        )}
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <NextIntlClientProvider messages={messages}>
          <SWRegister />
          <InstallPrompt />
          <CookieBanner />
          <ToasterClient />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
