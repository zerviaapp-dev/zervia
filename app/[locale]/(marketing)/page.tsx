import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/Card';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { GetStartedButton } from '@/components/GetStartedButton';
import { Link } from '@/i18n/routing';
import { categoryGroups, type Category } from '@/lib/categories';
import type { Locale } from '@/lib/locales';

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Public marketing homepage (Phase 0).
 * Blue-and-white brand, translated via next-intl, mobile-first.
 */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Home');
  const tc = await getTranslations('Categories');
  const tcg = await getTranslations('CategoryGroups');

  // Organization structured data for search engines.
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Zervia',
    url: 'https://zervia.app',
    slogan: 'Anything and everything, in one place.',
    description:
      'Services, travel, learning, jobs, and rewards — one tap away, in your language.',
    logo: 'https://zervia.app/icon-512.png',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      {/* Hero */}
      <section className="mx-auto w-full max-w-3xl px-5 pb-12 pt-8 text-center">
        <p className="text-xl font-medium text-brand-600 sm:text-2xl">
          {t('tagline')}
        </p>
        <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-brand-950 sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
          {t('subtitle')}
        </p>
        <div className="mt-8">
          <GetStartedButton />
        </div>
      </section>

      {/* Browse categories */}
      <section className="mx-auto w-full max-w-3xl px-5 py-12">
        <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
          {t('browseTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-lg text-slate-600">
          {t('browseSubtitle')}
        </p>
        <div className="mt-8 space-y-6">
          {categoryGroups.map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-500">
                {tcg(group.key)}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {group.categories.map((c: Category) => (
                  <Link
                    key={c}
                    href={`/discover?category=${c}`}
                    className="inline-flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-brand-200 bg-white px-4 py-3 text-center text-base font-semibold text-brand-800 transition-colors hover:border-brand-600 hover:bg-brand-50"
                  >
                    {tc(c)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-brand-50 px-5 py-12">
        <div className="mx-auto w-full max-w-3xl">
          <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
            {t('featuresTitle')}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Card
              title={t('featureServicesTitle')}
              text={t('featureServicesText')}
              href="/discover"
            />
            <Card
              title={t('featureRewardsTitle')}
              text={t('featureRewardsText')}
              href="/app/rewards"
            />
            <Card
              title={t('featureSupportTitle')}
              text={t('featureSupportText')}
              href="/support"
            />
          </div>
        </div>
      </section>

      {/* Languages */}
      <section className="mx-auto w-full max-w-3xl px-5 py-12 text-center">
        <h2 className="text-2xl font-extrabold text-brand-950 sm:text-3xl">
          {t('languagesTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-slate-600">
          {t('languagesText')}
        </p>
        <div className="mt-6">
          <LanguageSwitcher current={locale as Locale} />
        </div>
      </section>

      {/* Get started */}
      <section className="bg-brand-600 px-5 py-14">
        <div className="mx-auto w-full max-w-3xl text-center">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
            {t('ctaTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg leading-relaxed text-brand-100">
            {t('ctaText')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-white px-8 py-4 text-lg font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              {t('getStarted')}
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-white/60 px-8 py-4 text-lg font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
            >
              {t('logIn')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
