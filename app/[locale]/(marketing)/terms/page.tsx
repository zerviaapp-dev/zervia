import { getTranslations } from 'next-intl/server';
import { Panel } from '@/components/Panel';

const SECTIONS = ['intro', 'accounts', 'providers', 'community', 'payments', 'conduct', 'termination', 'changes'] as const;

/**
 * Public Terms of Service — the complete operative text, translated
 * via the Policies namespace. (Oct 23, 2026: the legal note no longer
 * claims a separate "full text" exists elsewhere; what is published
 * here is what applies. Founder should still have a local lawyer
 * review before launch.)
 */
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Policies' });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-brand-900">{t('termsTitle')}</h1>
      <p className="text-sm text-brand-600">{t('lastUpdated', { date: '2026-10-08' })}</p>

      {SECTIONS.map((section) => (
        <Panel key={section}>
          <h2 className="text-xl font-bold text-brand-900">
            {t(`terms_${section}_title`)}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-brand-800">
            {t(`terms_${section}_body`)}
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
