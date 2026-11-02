import { getTranslations } from 'next-intl/server';

/**
 * Lawyer-services disclaimer banner (decision plan L4 / audit Appendix A).
 * Must appear on the legal category surfaces and every legal listing.
 */
export async function LegalNoticeBanner({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'Connect' });
  return (
    <div
      role="note"
      className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4"
    >
      <p className="text-sm font-semibold leading-relaxed text-amber-900">
        ⚖ {t('legalBanner')}
      </p>
    </div>
  );
}
