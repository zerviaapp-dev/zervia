import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { Reveal } from '@/components/Reveal';

/**
 * Why Zervia — competitive positioning landing page.
 *
 * Compares Zervia against TaskRabbit and Home Depot Home Services using
 * verified competitive research (Oct 2026). All competitor figures are
 * factual and sourced; prose avoids disparaging language — competitors
 * are named only in the factual comparison table.
 *
 * Content is in English (the canonical version); a note explains that
 * translations are in progress for non-English locales.
 */
export default async function WhyZerviaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('WhyZervia');

  const pains = [
    { title: t('pain1Title'), text: t('pain1Text'), icon: '💸' },
    { title: t('pain2Title'), text: t('pain2Text'), icon: '⏳' },
    { title: t('pain3Title'), text: t('pain3Text'), icon: '⏱️' },
  ];

  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    label: t(`row${n}Label`),
    zervia: t(`row${n}Zervia`),
    taskrabbit: t(`row${n}TaskRabbit`),
    homedepot: t(`row${n}HomeDepot`),
  }));

  const customerBenefits = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`custB${n}Title`),
    text: t(`custB${n}Text`),
  }));

  const providerBenefits = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`provB${n}Title`),
    text: t(`provB${n}Text`),
  }));

  const promises = [1, 2, 3, 4].map((n) => ({
    title: t(`prom${n}Title`),
    text: t(`prom${n}Text`),
  }));

  const ctaButton =
    'inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-brand-700 hover:shadow-lg active:scale-[0.98] active:bg-brand-800';
  const ctaSecondary =
    'inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 py-4 text-lg font-semibold text-brand-700 transition-all duration-200 hover:scale-[1.03] hover:bg-brand-50 hover:shadow-lg active:scale-[0.98]';

  return (
    <div className="w-full">
      {locale !== 'en' && (
        <div className="mx-auto w-full max-w-4xl px-5 pt-10">
          <Panel>
            <p className="text-sm leading-relaxed text-brand-700">
              <strong>Note:</strong> {t('translationNote')}
            </p>
          </Panel>
        </div>
      )}

      {/* 1. Hero */}
      <Reveal>
        <section className="bg-gradient-to-b from-brand-50 via-white to-white">
          <div className="mx-auto w-full max-w-4xl px-5 pb-12 pt-12 text-center sm:pt-16">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
              {t('eyebrow')}
            </p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-brand-950 sm:text-5xl">
              {t('heroTitle')}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
              {t('heroSub')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/signup" className={ctaButton}>
                {t('heroCtaPrimary')}
              </Link>
              <Link href="/signup?type=provider" className={ctaSecondary}>
                {t('heroCtaSecondary')}
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      {/* 2. Pain points */}
      <section className="mx-auto w-full max-w-4xl px-5 py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {pains.map((p, i) => (
            <Reveal key={p.title} delay={i * 100}>
              <Panel className="h-full">
                <div className="text-3xl" aria-hidden="true">
                  {p.icon}
                </div>
                <h3 className="mt-3 text-lg font-bold text-brand-900">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {p.text}
                </p>
              </Panel>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-8 text-center text-xl font-bold text-brand-900">
            {t('painTransition')}
          </p>
        </Reveal>
      </section>

      {/* 3. Comparison table */}
      <Reveal>
        <section className="mx-auto w-full max-w-5xl px-5 py-10">
          <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
            {t('compareTitle')}
          </h2>

          {/* Desktop table */}
          <div className="mt-8 hidden overflow-hidden rounded-3xl border border-brand-100 shadow-[0_2px_16px_rgba(11,91,211,0.08)] md:block">
            <table className="w-full border-collapse bg-white text-left text-sm">
              <thead>
                <tr className="bg-brand-950 text-white">
                  <th className="px-5 py-4 font-bold">{t('colFeature')}</th>
                  <th className="px-5 py-4 font-bold">{t('colZervia')}</th>
                  <th className="px-5 py-4 font-bold">{t('colTaskRabbit')}</th>
                  <th className="px-5 py-4 font-bold">{t('colHomeDepot')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.label}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-brand-50/60'}
                  >
                    <th className="px-5 py-4 font-bold text-brand-900">
                      {r.label}
                    </th>
                    <td className="px-5 py-4 font-semibold text-brand-700">
                      {r.zervia}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{r.taskrabbit}</td>
                    <td className="px-5 py-4 text-slate-600">{r.homedepot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="mt-8 space-y-6 md:hidden">
            {[
              { name: t('colZervia'), highlight: true, key: 'zervia' as const },
              { name: t('colTaskRabbit'), highlight: false, key: 'taskrabbit' as const },
              { name: t('colHomeDepot'), highlight: false, key: 'homedepot' as const },
            ].map((col) => (
              <Reveal key={col.name}>
                <Panel
                  className={
                    col.highlight ? 'border-2 border-brand-600 bg-brand-50/50' : ''
                  }
                >
                  <h3
                    className={`text-lg font-extrabold ${
                      col.highlight ? 'text-brand-700' : 'text-brand-900'
                    }`}
                  >
                    {col.name}
                  </h3>
                  <dl className="mt-4 space-y-3">
                    {rows.map((r) => (
                      <div key={r.label}>
                        <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {r.label}
                        </dt>
                        <dd
                          className={`mt-1 text-sm leading-relaxed ${
                            col.highlight
                              ? 'font-semibold text-brand-800'
                              : 'text-slate-600'
                          }`}
                        >
                          {r[col.key]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
              </Reveal>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-slate-500">
            {t('compareFootnote')}
          </p>
        </section>
      </Reveal>

      {/* 4. Why customers choose Zervia */}
      <section className="bg-brand-50/50">
        <div className="mx-auto w-full max-w-4xl px-5 py-12">
          <div className="grid gap-8 md:grid-cols-2 md:items-start">
            <Reveal>
              <div>
                <h2 className="text-2xl font-extrabold text-brand-950 sm:text-3xl">
                  {t('custTitle')}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-slate-600">
                  {t('custIntro')}
                </p>
                <div className="mt-6">
                  <Link href="/discover" className={ctaButton}>
                    {t('custCta')}
                  </Link>
                </div>
              </div>
            </Reveal>
            <div className="space-y-3">
              {customerBenefits.map((b, i) => (
                <Reveal key={b.title} delay={Math.min(i, 3) * 60}>
                  <div className="flex gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_16px_rgba(11,91,211,0.08)]">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <p className="text-sm leading-relaxed text-slate-700">
                      <strong className="text-brand-900">{b.title}</strong>{' '}
                      {b.text}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Why providers choose Zervia */}
      <section className="mx-auto w-full max-w-4xl px-5 py-12">
        <div className="grid gap-8 md:grid-cols-2 md:items-start">
          <div className="space-y-3 md:order-1">
            {providerBenefits.map((b, i) => (
              <Reveal key={b.title} delay={Math.min(i, 3) * 60}>
                <div className="flex gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_16px_rgba(11,91,211,0.08)] ring-1 ring-brand-100">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <p className="text-sm leading-relaxed text-slate-700">
                    <strong className="text-brand-900">{b.title}</strong>{' '}
                    {b.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="md:order-2">
            <div className="md:sticky md:top-8">
              <h2 className="text-2xl font-extrabold text-brand-950 sm:text-3xl">
                {t('provTitle')}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                {t('provIntro')}
              </p>
              <Panel className="mt-6 border-2 border-brand-600 bg-brand-50">
                <p className="text-base font-bold leading-relaxed text-brand-900">
                  {t('statCallout')}
                </p>
              </Panel>
              <div className="mt-6">
                <Link href="/signup?type=provider" className={ctaButton}>
                  {t('provCta')}
                </Link>
                <p className="mt-3 text-sm text-slate-500">
                  {t('provAgreementPrefix')}{' '}
                  <Link
                    href="/provider-agreement"
                    className="text-brand-600 hover:underline"
                  >
                    {t('provAgreementLink')}
                  </Link>{' '}
                  {t('provAgreementSuffix')}
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 6. Our promises */}
      <Reveal>
        <section className="mx-auto w-full max-w-4xl px-5 py-10">
          <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
            {t('promisesTitle')}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {promises.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <Panel className="h-full text-center">
                  <div
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </div>
                  <h3 className="mt-4 text-base font-bold text-brand-900">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {p.text}
                  </p>
                </Panel>
              </Reveal>
            ))}
          </div>
        </section>
      </Reveal>

      {/* 7. Final CTA */}
      <Reveal>
        <section className="bg-brand-950">
          <div className="mx-auto w-full max-w-4xl px-5 py-14 text-center">
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
              {t('finalTitle')}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-brand-100">
              {t('finalSub')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-white px-8 py-4 text-lg font-semibold text-brand-700 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
              >
                {t('finalCtaPrimary')}
              </Link>
              <Link
                href="/signup?type=provider"
                className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-white px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-white/10 active:scale-[0.98]"
              >
                {t('finalCtaSecondary')}
              </Link>
            </div>
            <p className="mt-4 text-sm text-brand-200">{t('finalNote')}</p>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
