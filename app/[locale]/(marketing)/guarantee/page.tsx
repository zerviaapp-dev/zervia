import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { AffiliateNote } from '@/components/AffiliateNote';

/**
 * "How Zervia works" — connector honesty page (layout L3).
 *
 * This route previously carried the First-Session Guarantee promise
 * copy. Under the affiliate-only decision (Oct 20, 2026) Zervia does
 * not hold payments, guarantee a provider's work, or refund services —
 * the page now states exactly what Zervia checks, what it charges for,
 * and who charges/refunds the customer for a service (the provider).
 * Internal record: copy drafted by Lizzie, v1 — NOT lawyer-reviewed.
 */
export default async function HowZerviaWorksPage({
  params,
}: {
  params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'HowZerviaWorks' });

  const sections = [
    { title: t('checksTitle'), text: t('checksText'), icon: '✓' },
    { title: t('moneyTitle'), text: t('moneyText'), icon: '💳' },
    { title: t('feesTitle'), text: t('feesText'), icon: '🏷️' },
    { title: t('reviewsTitle'), text: t('reviewsText'), icon: '⭐' },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-10">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-950">{t('title')}</h1>
        <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-base font-medium text-brand-800">
          {t('replacesNote')}
        </p>
        <p className="mt-2 text-lg text-brand-700">{t('subtitle')}</p>
      </div>

      {sections.map((s) => (
        <Panel key={s.title}>
          <h2 className="flex items-center gap-2 text-xl font-bold text-brand-900">
            <span aria-hidden="true">{s.icon}</span> {s.title}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-brand-800">{s.text}</p>
        </Panel>
      ))}

      <Panel>
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand-900">
          <span aria-hidden="true">📍</span> {t('communityTitle')}
        </h2>
        <p className="mt-2 text-base leading-relaxed text-brand-800">{t('communityText')}</p>
      </Panel>

      <Panel>
        <AffiliateNote locale={locale} />
      </Panel>

      <div className="text-center">
        <Link
          href="/discover"
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700"
        >
          {t('cta')}
        </Link>
      </div>
    </div>
  );
}
