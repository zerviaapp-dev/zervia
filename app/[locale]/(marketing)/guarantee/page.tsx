import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { Reveal } from '@/components/Reveal';
import { GUARANTEE_CATEGORIES } from '@/lib/guarantee';

/**
 * First-Session Guarantee — trust policy page.
 *
 * "Don't love your first session with a new provider? It's on us."
 * Applies to categories where personal "fit" matters (learning, beauty,
 * wellness, personal services). Zervia absorbs the refund cost — providers
 * still get paid.
 *
 * Content is in English (the canonical version); a note explains that
 * translations are in progress for non-English locales.
 */
export default async function GuaranteePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('Guarantee');

  const steps = [1, 2, 3].map((n) => ({
    title: t(`step${n}Title`),
    text: t(`step${n}Text`),
    icon: ['📅', '😐', '💸'][n - 1],
  }));

  const covered = [1, 2].map((n) => ({
    title: t(`covered${n}Title`),
    text: t(`covered${n}Text`),
  }));

  const notCovered = [1, 2, 3].map((n) => ({
    title: t(`notCovered${n}Title`),
    text: t(`notCovered${n}Text`),
  }));

  const rules = [1, 2, 3, 4].map((n) => t(`rule${n}`));

  const ctaButton =
    'inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-brand-700 hover:shadow-lg active:scale-[0.98] active:bg-brand-800';

  return (
    <div className="w-full">
      {/* Coming Soon — guarantee is not active yet (CEO directive Oct 2026).
          The page explains the program; claim submission is disabled. */}
      <div className="mx-auto w-full max-w-4xl px-5 pt-10">
        <div
          role="status"
          className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4 text-center"
        >
          <p className="text-base font-extrabold text-amber-900">
            🚧 {t('comingSoonTitle', { default: 'Coming Soon' })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-800">
            {t('comingSoonText', {
              default:
                'The First-Session Guarantee launches soon. Claims are not being accepted yet — check back after launch.',
            })}
          </p>
        </div>
      </div>

      {locale !== 'en' && (
        <div className="mx-auto w-full max-w-4xl px-5 pt-10">
          <Panel>
            <p className="text-sm leading-relaxed text-brand-700">
              <strong>Note:</strong> {t('translationNote')}
            </p>
          </Panel>
        </div>
      )}

      {/* Hero */}
      <Reveal>
        <section className="bg-gradient-to-b from-brand-50 via-white to-white">
          <div className="mx-auto w-full max-w-4xl px-5 pb-12 pt-12 text-center sm:pt-16">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
              {t('eyebrow')}
            </p>
            <div className="mt-4 text-6xl" aria-hidden="true">
              🛡️
            </div>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-brand-950 sm:text-5xl">
              {t('heroTitle')}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
              {t('heroSubtitle')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/discover" className={ctaButton}>
                {t('heroCta')}
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      {/* How it works */}
      <Reveal>
        <section className="mx-auto w-full max-w-5xl px-5 py-12">
          <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
            {t('howTitle')}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
            {t('howSubtitle')}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 90}>
                <Panel className="h-full">
                  <div className="text-4xl" aria-hidden="true">
                    {s.icon}
                  </div>
                  <p className="mt-2 text-xs font-bold uppercase tracking-widest text-brand-500">
                    {t('stepLabel', { n: i + 1 })}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-brand-900">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
                </Panel>
              </Reveal>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Eligible categories */}
      <Reveal>
        <section className="bg-brand-50 px-5 py-12">
          <div className="mx-auto w-full max-w-5xl">
            <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
              {t('eligibleTitle')}
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
              {t('eligibleSubtitle')}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {GUARANTEE_CATEGORIES.map((c) => (
                <Link
                  key={c}
                  href={`/discover?category=${c}`}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-brand-200 bg-white px-5 py-2.5 text-sm font-bold text-brand-800 transition-all hover:scale-[1.03] hover:border-brand-400 hover:shadow-md"
                >
                  <span aria-hidden="true">🛡️</span>
                  {t(`cat_${c}`)}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* Covered / not covered */}
      <Reveal>
        <section className="mx-auto w-full max-w-5xl px-5 py-12">
          <div className="grid gap-6 md:grid-cols-2">
            <Panel className="border-l-4 border-l-emerald-500">
              <h2 className="text-xl font-extrabold text-brand-950">
                {t('coveredTitle')}
              </h2>
              <ul className="mt-4 space-y-4">
                {covered.map((c) => (
                  <li key={c.title} className="flex gap-3">
                    <span className="text-xl" aria-hidden="true">
                      ✅
                    </span>
                    <div>
                      <p className="font-bold text-brand-900">{c.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                        {c.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="border-l-4 border-l-amber-500">
              <h2 className="text-xl font-extrabold text-brand-950">
                {t('notCoveredTitle')}
              </h2>
              <ul className="mt-4 space-y-4">
                {notCovered.map((c) => (
                  <li key={c.title} className="flex gap-3">
                    <span className="text-xl" aria-hidden="true">
                      ⚠️
                    </span>
                    <div>
                      <p className="font-bold text-brand-900">{c.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                        {c.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </section>
      </Reveal>

      {/* Fair-use rules */}
      <Reveal>
        <section className="bg-brand-950 px-5 py-12">
          <div className="mx-auto w-full max-w-4xl">
            <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">
              {t('rulesTitle')}
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-brand-200">
              {t('rulesSubtitle')}
            </p>
            <ol className="mt-8 space-y-3">
              {rules.map((r, i) => (
                <li
                  key={r}
                  className="flex items-start gap-4 rounded-2xl bg-white/5 p-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-extrabold text-white">
                    {i + 1}
                  </span>
                  <p className="pt-1 text-sm leading-relaxed text-brand-100">{r}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </Reveal>

      {/* Provider note */}
      <Reveal>
        <section className="mx-auto w-full max-w-4xl px-5 py-12">
          <Panel>
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <div className="text-4xl" aria-hidden="true">
                🤝
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-brand-950">
                  {t('providerNoteTitle')}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {t('providerNoteText')}
                </p>
                <Link
                  href="/providers"
                  className="mt-3 inline-block text-sm font-bold text-brand-600 hover:text-brand-700 hover:underline"
                >
                  {t('providerNoteCta')} →
                </Link>
              </div>
            </div>
          </Panel>
        </section>
      </Reveal>

      {/* Final CTA */}
      <Reveal>
        <section className="bg-gradient-to-b from-white to-brand-50 px-5 py-12">
          <div className="mx-auto w-full max-w-4xl text-center">
            <h2 className="text-3xl font-extrabold text-brand-950">
              {t('finalTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">{t('finalSubtitle')}</p>
            <div className="mt-8">
              <Link href="/discover" className={ctaButton}>
                {t('finalCta')}
              </Link>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
