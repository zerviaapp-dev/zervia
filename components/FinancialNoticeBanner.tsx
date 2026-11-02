import { getTranslations } from 'next-intl/server';

/**
 * Financial-services disclaimer banner (Oct 20 live-test fix batch, Z4).
 * Must appear on the insurance / mortgage category surfaces and every
 * such listing: Zervia does not sell insurance or arrange mortgages;
 * providers are independent licensed professionals (AIC / RECA).
 */
export async function FinancialNoticeBanner({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'Connect' });
  return (
    <div
      role="note"
      className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-5 py-4"
    >
      <p className="text-sm font-semibold leading-relaxed text-emerald-900">
        🛡️ {t('financialBanner')}
      </p>
    </div>
  );
}
