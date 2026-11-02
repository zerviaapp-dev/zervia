import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { AgreementReacceptForm } from '@/components/provider/AgreementReacceptForm';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { sanitizeAgreementNext } from '@/lib/agreement-next';
import { fetchAgreementDecision } from '@/lib/supabase/agreement-gate';
import {
  PROVIDER_AGREEMENT_SECTIONS,
  PROVIDER_AGREEMENT_VERSION,
} from '@/lib/provider-agreement';

/**
 * Provider Agreement re-acceptance gate screen.
 *
 * Middleware routes providers here when their recorded agreement_version
 * is older than the current PROVIDER_AGREEMENT_VERSION. This page
 * re-checks server-side (defence in depth):
 * - no provider row → existing onboarding flow (never this gate);
 * - already on the current version → straight back to `next`;
 * - stale version → the CURRENT full agreement (same rendering as the
 *   public /provider-agreement page) + the onboarding acceptance
 *   mechanics (checkbox + initials) via AgreementReacceptForm.
 */
export default async function ProviderAgreementGatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Provider' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizedPath('/login', locale));
  }

  const decision = await fetchAgreementDecision(supabase, user.id);
  if (decision === 'onboarding') {
    redirect(localizedPath('/app/provider/onboarding', locale));
  }
  const nextPath = sanitizeAgreementNext(next, locale);
  if (decision === 'pass') {
    redirect(nextPath);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900 sm:text-3xl">
          {t('reacceptTitle')}
        </h1>
        <p className="mt-1 text-sm text-brand-600">
          Version {PROVIDER_AGREEMENT_VERSION} · Last updated October 20, 2026
        </p>
      </div>

      <Panel>
        <p className="text-base leading-relaxed text-brand-800">
          {t('reacceptIntro')}
        </p>
        <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium leading-relaxed text-brand-800">
          {t('reacceptWhatChanged')}
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
        <h2 className="text-lg font-bold text-brand-900">
          {t('agreementTitle')}
        </h2>
        <div className="mt-3">
          <AgreementReacceptForm locale={locale} nextPath={nextPath} />
        </div>
      </Panel>
    </div>
  );
}
