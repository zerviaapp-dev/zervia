import { useTranslations } from 'next-intl';

/**
 * Accepted-payment-method badges. Rendered on billing pages so buyers
 * know their options before they pay:
 *  - Card — via Stripe Checkout (always)
 *  - Apple Pay / Google Pay — via Stripe Checkout on supported
 *    devices; enabled in the Stripe Dashboard → Settings → Payments
 *    → Wallets (no code needed — Checkout offers them automatically)
 *  - PayPal — direct PayPal integration (when PAYPAL_CLIENT_ID is set)
 *
 * The badges are informational only; the actual payment method is
 * chosen at the payment step (Stripe Checkout or PayPal approval).
 */
export function PaymentMethodBadges({
  paypalReady,
  walletsReady,
}: {
  paypalReady: boolean;
  /** True when Stripe wallets are enabled in the Stripe dashboard. */
  walletsReady: boolean;
}) {
  const t = useTranslations('Billing');
  const badge =
    'inline-flex min-h-[44px] items-center rounded-full border-2 border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-800';
  return (
    <div>
      <p className="text-sm font-semibold text-brand-700">{t('acceptedMethodsTitle')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className={badge}>💳 {t('methodCard')}</span>
        {walletsReady ? (
          <>
            <span className={badge}> {t('methodApplePay')}</span>
            <span className={badge}>G {t('methodGooglePay')}</span>
          </>
        ) : null}
        {paypalReady ? <span className={badge}>🅿️ {t('methodPayPal')}</span> : null}
      </div>
      {!walletsReady ? (
        <p className="mt-2 text-xs text-brand-600">{t('walletsDashboardNote')}</p>
      ) : null}
    </div>
  );
}
