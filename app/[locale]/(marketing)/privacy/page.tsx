import { getTranslations } from 'next-intl/server';
import { Panel } from '@/components/Panel';

const SECTIONS = ['intro', 'collect', 'use', 'share', 'rights', 'security', 'contact'] as const;

/**
 * Public Privacy Policy. Covers PIPEDA (Canada) and GDPR (EU/UK) basics:
 * what we collect, why, your rights (access/export/delete), and how to
 * exercise them (the in-app Privacy page). Summaries translated; the
 * founder should have a local lawyer review before launch.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Policies' });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-brand-900">{t('privacyTitle')}</h1>
      <p className="text-sm text-brand-600">{t('lastUpdated', { date: '2026-10-08' })}</p>

      {SECTIONS.map((section) => (
        <Panel key={section}>
          <h2 className="text-xl font-bold text-brand-900">
            {t(`privacy_${section}_title`)}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-brand-800">
            {t(`privacy_${section}_body`)}
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
