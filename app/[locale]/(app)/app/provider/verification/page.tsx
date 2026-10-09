import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { TrustBadge, type TrustLevel } from '@/components/TrustBadge';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { VerificationForm } from '@/components/verification/VerificationForm';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

type ProviderVerification = {
  id: string;
  business_name: string;
  trust_level: TrustLevel;
  id_verified: boolean;
  id_verification_status: string;
  license_verified: boolean;
  insurance_verified: boolean;
  background_check_status: string;
  completed_jobs: number | null;
  rating_avg: number | null;
  review_count: number | null;
};

type VerificationDoc = {
  id: string;
  doc_type: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

/**
 * Provider verification hub: current trust status, per-document states,
 * and the verification request form. Verification is what unlocks the
 * higher trust tiers — and trust is what wins bookings.
 */
export default async function ProviderVerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Trust' });
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

  const { data: provider } = (await supabase
    .from('providers')
    .select(
      'id, business_name, trust_level, id_verified, id_verification_status, license_verified, insurance_verified, background_check_status, completed_jobs, rating_avg, review_count'
    )
    .eq('user_id', user.id)
    .maybeSingle()) as { data: ProviderVerification | null };

  if (!provider) {
    redirect(localizedPath('/app/provider/onboarding', locale));
  }

  const { data: docs } = (await supabase
    .from('verification_documents')
    .select('id, doc_type, status, rejection_reason, created_at')
    .eq('provider_id', provider.id)
    .order('created_at', { ascending: false })) as { data: VerificationDoc[] | null };

  const statusFor = (docType: string): string | null => {
    const doc = (docs ?? []).find((d) => d.doc_type === docType);
    return doc?.status ?? null;
  };

  const statusChip = (status: string | null) => {
    if (!status) {
      return (
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {t('statusNotSubmitted')}
        </span>
      );
    }
    const styles: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-700',
    };
    return (
      <span
        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}
      >
        {t(`status_${status}`)}
      </span>
    );
  };

  const checks: { key: string; status: string | null; verified: boolean }[] = [
    {
      key: 'government_id',
      status: statusFor('government_id') ?? provider.id_verification_status,
      verified: provider.id_verified,
    },
    {
      key: 'professional_license',
      status: statusFor('professional_license'),
      verified: provider.license_verified,
    },
    {
      key: 'insurance_proof',
      status: statusFor('insurance_proof'),
      verified: provider.insurance_verified,
    },
    {
      key: 'background_check',
      status: statusFor('background_check') ?? provider.background_check_status,
      verified: provider.background_check_status === 'approved',
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/app/provider"
          className="inline-flex min-h-[44px] items-center text-base font-semibold text-brand-700"
        >
          ← {t('backToDashboard')}
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-900">{t('title')}</h1>
        <p className="mt-1 text-base text-brand-700">{t('subtitle')}</p>
      </div>

      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('currentTrust')}</h2>
        <div className="mt-3">
          <TrustBadge
            level={provider.trust_level ?? 'new'}
            ratingAvg={provider.rating_avg}
            reviewCount={provider.review_count}
            completedJobs={provider.completed_jobs}
            variant="full"
          />
        </div>
        <p className="mt-3 text-sm text-brand-700">{t('trustExplainer')}</p>
      </Panel>

      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('checksTitle')}</h2>
        <ul className="mt-3 space-y-3">
          {checks.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-brand-100 px-4 py-3"
            >
              <div>
                <p className="text-base font-semibold text-brand-900">{t(`docType_${c.key}`)}</p>
                <p className="text-sm text-brand-600">{t(`docType_${c.key}_hint`)}</p>
              </div>
              {statusChip(c.verified ? 'approved' : c.status)}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <h2 className="text-xl font-bold text-brand-900">{t('requestTitle')}</h2>
        <p className="mt-1 text-sm text-brand-700">{t('requestBody')}</p>
        <div className="mt-4">
          <VerificationForm locale={locale} />
        </div>
      </Panel>
    </div>
  );
}
