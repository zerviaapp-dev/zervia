import { getTranslations } from 'next-intl/server';
import { Panel } from '@/components/Panel';

const SECTIONS = ['intro', 'subscriptions', 'boosts', 'leadfees', 'disputes', 'contact'] as const;

/**
 * Public Refund Policy. Stripe requires a stated refund policy before
 * live charges; disputes cost $15 each win or lose, so this page exists
 * to keep them rare: clear windows, clear process, human review.
 */
export default async function RefundsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Policies' });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-brand-900">{t('refundsTitle')}</h1>
      <p className="text-sm text-brand-600">{t('lastUpdated', { date: '2026-10-08' })}</p>

      {SECTIONS.map((section) => (
        <Panel key={section}>
          <h2 className="text-xl font-bold text-brand-900">
            {t(`refunds_${section}_title`)}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-brand-800">
            {t(`refunds_${section}_body`)}
          </p>
        </Panel>
      ))}

      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('legalNoteTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-700">
          {t('legalNoteBody')}
        </p>
      </Panel>
    </div>
  );
}
