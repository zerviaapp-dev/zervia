import { Panel } from '@/components/Panel';
import {
  PROVIDER_AGREEMENT_SECTIONS,
  PROVIDER_AGREEMENT_VERSION,
} from '@/lib/provider-agreement';

/**
 * Public Provider Agreement page.
 *
 * Displays the FULL agreement (all sections from PROVIDER_AGREEMENT_SECTIONS)
 * — not just the 4-bullet summary shown in onboarding. Providers must be able
 * to read the complete agreement before accepting it.
 *
 * The agreement text is in English (the canonical version). Translations are
 * in progress — a note below explains this.
 */
export default async function ProviderAgreementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-brand-900">Provider Agreement</h1>
      <p className="text-sm text-brand-600">
        Version {PROVIDER_AGREEMENT_VERSION} · Last updated October 11, 2026
      </p>

      <Panel>
        <p className="text-sm leading-relaxed text-brand-700">
          This is the full Zervia Provider Agreement. Every provider accepts
          this agreement during signup. Please read it carefully before
          accepting.
        </p>
        {locale !== 'en' && (
          <p className="mt-2 text-sm leading-relaxed text-brand-700">
            <strong>Note:</strong> The authoritative version of this agreement
            is in English, shown below. Translations are in progress.
          </p>
        )}
      </Panel>

      {PROVIDER_AGREEMENT_SECTIONS.map((section, i) => (
        <Panel key={section.title}>
          <h2 className="text-xl font-bold text-brand-900">
            {i + 1}. {section.title}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-brand-800">
            {section.clauses.map((clause, j) => (
              <li key={j}>{clause}</li>
            ))}
          </ul>
        </Panel>
      ))}

      <Panel>
        <h2 className="text-xl font-bold text-brand-900">Acceptance</h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-700">
          By checking the acceptance box during provider signup, you confirm
          that you have read and agree to all sections of this Provider
          Agreement (version {PROVIDER_AGREEMENT_VERSION}). If the agreement
          is updated, you will be asked to accept the new version before
          continuing to use provider features.
        </p>
      </Panel>
    </div>
  );
}
