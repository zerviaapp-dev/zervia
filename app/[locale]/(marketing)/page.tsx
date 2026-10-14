import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/Card';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { GetStartedButton } from '@/components/GetStartedButton';
import { HeroSearch } from '@/components/HeroSearch';
import { TrendingSection } from '@/components/TrendingSection';
import { CategoryPhotoCard } from '@/components/CategoryPhotoCard';
import { Reveal } from '@/components/Reveal';
import { Link } from '@/i18n/routing';
import {
  categories,
  categoryGroups,
  subcategories,
  type Category,
} from '@/lib/categories';
import { showcaseOrder } from '@/lib/category-meta';
import { locales, type Locale } from '@/lib/locales';

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

  // Real platform stats for the social-proof section — computed from the
  // codebase so they stay in sync. Never hardcode or fabricate these.
  const categoryCount = categories.length;
  const serviceTypeCount = Object.values(subcategories).reduce(
    (n, list) => n + list.length,
    0
  );
  const languageCount = locales.length;

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
        // Escape `<` as defense-in-depth (org data is static, but the
        // pattern must stay safe if user content is ever added).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd).replace(/</g, '\\u003c') }}
      />
      {/* Hero */}
      <Reveal>
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
          <HeroSearch />
        </section>
      </Reveal>

      {/* Browse categories — photo marketplace cards */}
      <Reveal>
        <section className="mx-auto w-full max-w-5xl px-5 py-12">
          <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
            {t('browseTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-lg text-slate-600">
            {t('browseSubtitle')}
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {showcaseOrder.slice(0, 6).map((c: Category, i: number) => (
              <Reveal key={c} delay={i * 80}>
                <CategoryPhotoCard
                  category={c}
                  label={tc(c)}
                  fromLabel={t.raw('fromPrice')}
                />
              </Reveal>
            ))}
          </div>
        <div className="mt-6 text-center">
          <Link
            href="/services"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-base font-bold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-brand-700 hover:shadow-lg active:scale-[0.98]"
          >
            {t('browseAll')}
          </Link>
        </div>
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
      </Reveal>

      {/* Trending Now — most-booked services in the last 30 days */}
      <Reveal>
        <TrendingSection locale={locale} />
      </Reveal>

      {/* Features */}
      <Reveal>
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
              className="sm:col-span-2 sm:row-span-2 sm:p-8"
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
      </Reveal>

      {/* Languages */}
      <Reveal>
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
      </Reveal>

      {/* Social proof — real platform stats, computed from the codebase.
          No fabricated testimonials or fake numbers. */}
      <Reveal>
      <section className="mx-auto w-full max-w-5xl px-5 py-12">
        <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
          {t('socialProofTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-lg text-slate-600">
          {t('socialProofSubtitle')}
        </p>
        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-brand-100 bg-white p-4 text-center shadow-[0_2px_16px_rgba(11,91,211,0.08)] sm:p-6">
            <p className="text-3xl font-extrabold text-brand-700 sm:text-4xl">
              {categoryCount}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {t('statCategoriesLabel')}
            </p>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-4 text-center shadow-[0_2px_16px_rgba(11,91,211,0.08)] sm:p-6">
            <p className="text-3xl font-extrabold text-brand-700 sm:text-4xl">
              {serviceTypeCount}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {t('statServiceTypesLabel')}
            </p>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-4 text-center shadow-[0_2px_16px_rgba(11,91,211,0.08)] sm:p-6">
            <p className="text-3xl font-extrabold text-brand-700 sm:text-4xl">
              {languageCount}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {t('statLanguagesLabel')}
            </p>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-3xl rounded-2xl bg-brand-600 p-8 text-center sm:p-10">
          <h3 className="text-xl font-extrabold text-white sm:text-2xl">
            {t('foundingCtaTitle')}
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-base leading-relaxed text-brand-100">
            {t('foundingCtaText')}
          </p>
          <Link
            href="/signup?type=provider"
            className="mt-6 inline-flex min-h-[56px] items-center justify-center rounded-full bg-white px-8 py-4 text-lg font-semibold text-brand-700 transition-all duration-200 hover:scale-[1.03] hover:bg-brand-50 hover:shadow-lg active:scale-[0.98]"
          >
            {t('foundingCtaButton')}
          </Link>
        </div>
      </section>
      </Reveal>

      {/* Get started */}
      <Reveal>
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
              className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-white px-8 py-4 text-lg font-semibold text-brand-700 transition-all duration-200 hover:scale-[1.03] hover:bg-brand-50 hover:shadow-lg active:scale-[0.98]"
            >
              {t('getStarted')}
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-white/60 px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:border-white hover:bg-white/10 hover:shadow-lg active:scale-[0.98]"
            >
              {t('logIn')}
            </Link>
          </div>
        </div>
      </section>
      </Reveal>
    </>
  );
}
