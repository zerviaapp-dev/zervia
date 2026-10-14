import { getTranslations } from 'next-intl/server';

/**
 * "Payment protected by Zervia" badge — anti-disintermediation trust signal.
 * Shown on booking flows and listing cards: money stays in escrow until
 * the job is done, which is the #1 reason to book through Zervia instead
 * of going direct.
 */
export async function PaymentProtectedBadge({
  locale,
  variant = 'chip',
}: {
  locale: string;
  variant?: 'chip' | 'banner';
}) {
  const t = await getTranslations({ locale, namespace: 'Trust' });
  if (variant === 'banner') {
    return (
      <div className="flex items-start gap-3 rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-4">
        <span aria-hidden="true" className="text-2xl">
          🔒
        </span>
        <div>
          <p className="text-sm font-extrabold text-emerald-900">
            {t('paymentProtectedTitle')}
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            {t('paymentProtectedText')}
          </p>
        </div>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
      <span aria-hidden="true">🔒</span> {t('paymentProtectedShort')}
    </span>
  );
}
