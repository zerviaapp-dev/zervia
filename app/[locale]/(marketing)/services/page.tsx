import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { categoryGroups, type Category } from '@/lib/categories';
import { categoryShowcase, showcaseOrder } from '@/lib/category-meta';
import { isGuaranteeCategory } from '@/lib/guarantee';
import { calgary } from '@/lib/regions';

type ServicesPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ region?: string }>;
};

/**
 * Marketplace services storefront — the Airbnb/TaskRabbit-style browse page.
 *
 * Photo cards for all 15 categories, live search, and a Calgary
 * region selector (NE / NW / SE / SW / Central) so every area sees its
 * own local marketplace. Regions persist as a `?region=` query param.
 */
export default async function ServicesPage({ params, searchParams }: ServicesPageProps) {
  const { locale } = await params;
  const { region = '' } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Services');
  const tc = await getTranslations('Categories');
  const tcg = await getTranslations('CategoryGroups');

  const activeRegion = calgary.regions.find((r) => r.key === region) ?? null;

  const regionHref = (key: string) =>
    key ? `/services?region=${encodeURIComponent(key)}` : '/services';

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-600 to-brand-800 px-5 pb-10 pt-10 text-white">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-200">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-brand-100">{t('subtitle')}</p>

          {/* Search */}
          <form
            method="get"
            action="/discover"
            className="mt-6 flex flex-col gap-2 rounded-3xl bg-white p-2 shadow-xl sm:flex-row"
          >
            <label htmlFor="services-q" className="sr-only">
              {t('searchLabel')}
            </label>
            <input
              id="services-q"
              name="q"
              placeholder={t('searchPlaceholder')}
              className="min-h-[56px] flex-1 rounded-2xl px-5 text-base text-slate-900 outline-none placeholder:text-slate-400"
            />
            {activeRegion ? (
              <input type="hidden" name="region" value={activeRegion.key} />
            ) : null}
            <button
              type="submit"
              className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-brand-600 px-8 text-base font-bold text-white hover:bg-brand-700"
            >
              {t('searchButton')}
            </button>
          </form>

          {/* Region selector — Calgary quadrants */}
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-brand-200">
              📍 {t('regionLabel')}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('regionLabel')}>
              <Link
                href={regionHref('')}
                aria-pressed={!activeRegion}
                className={`inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-bold transition-colors ${
                  !activeRegion
                    ? 'bg-white text-brand-700'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {t('allRegions')}
              </Link>
              {calgary.regions.map((r) => (
                <Link
                  key={r.key}
                  href={regionHref(r.key)}
                  aria-pressed={activeRegion?.key === r.key}
                  className={`inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-bold transition-colors ${
                    activeRegion?.key === r.key
                      ? 'bg-white text-brand-700'
                      : 'bg-white/15 text-white hover:bg-white/25'
                  }`}
                >
                  {r.label} · {r.name.replace(' Calgary', '')}
                </Link>
              ))}
            </div>
            {activeRegion ? (
              <p className="mt-2 text-sm text-brand-200">
                {t('regionServing', {
                  name: activeRegion.name,
                  count: activeRegion.neighborhoods.length,
                })}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Category photo grid */}
      <section className="mx-auto w-full max-w-5xl px-5 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-brand-950 sm:text-3xl">
              {t('browseTitle')}
            </h2>
            <p className="mt-1 text-slate-600">{t('browseSubtitle')}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {showcaseOrder.map((key: Category) => {
            const meta = categoryShowcase[key];
            const href = activeRegion
              ? `/discover?category=${key}&region=${activeRegion.key}`
              : `/discover?category=${key}`;
            return (
              <Link
                key={key}
                href={href}
                className="group relative block overflow-hidden rounded-3xl shadow-md transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={meta.photo}
                  alt={tc(key)}
                  loading="lazy"
                  className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${meta.gradient} via-black/20 to-transparent`}
                  aria-hidden="true"
                />
                {isGuaranteeCategory(key) && (
                  <span
                    className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-brand-800 shadow-sm"
                    title={t('guaranteeBadgeHint')}
                  >
                    <span aria-hidden="true">🛡️</span>
                    {t('guaranteeBadge')}
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <h3 className="text-xl font-extrabold text-white">{tc(key)}</h3>
                      <p className="mt-0.5 text-sm font-medium text-white/85">
                        {meta.tagline}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-brand-800">
                      {t('fromPrice', { price: meta.fromPrice })}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-xs font-semibold uppercase tracking-wide text-white/75">
                    {meta.popular.join(' · ')}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-brand-50 px-5 py-12">
        <div className="mx-auto w-full max-w-5xl">
          <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
            {t('howTitle')}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { icon: '🔍', title: t('how1Title'), text: t('how1Text') },
              { icon: '📅', title: t('how2Title'), text: t('how2Text') },
              { icon: '⭐', title: t('how3Title'), text: t('how3Text') },
            ].map((s) => (
              <div key={s.title} className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="text-4xl" aria-hidden="true">
                  {s.icon}
                </div>
                <h3 className="mt-3 text-lg font-bold text-brand-900">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Grouped text links for SEO / completeness */}
      <section className="mx-auto w-full max-w-5xl px-5 py-10">
        <h2 className="text-xl font-extrabold text-brand-950">{t('allServicesTitle')}</h2>
        <div className="mt-4 space-y-5">
          {categoryGroups.map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-500">
                {tcg(group.key)}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.categories.map((c) => (
                  <Link
                    key={c}
                    href={
                      activeRegion
                        ? `/discover?category=${c}&region=${activeRegion.key}`
                        : `/discover?category=${c}`
                    }
                    className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brand-200 bg-white px-4 text-sm font-semibold text-brand-800 hover:border-brand-600"
                  >
                    {tc(c)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Provider CTA */}
      <section className="bg-brand-600 px-5 py-14">
        <div className="mx-auto w-full max-w-3xl text-center">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
            {t('providerTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-brand-100">{t('providerText')}</p>
          <Link
            href="/app/become-provider"
            className="mt-8 inline-flex min-h-[56px] items-center justify-center rounded-full bg-white px-8 py-4 text-lg font-bold text-brand-700 hover:bg-brand-50"
          >
            {t('providerCta')}
          </Link>
        </div>
      </section>
    </>
  );
}
