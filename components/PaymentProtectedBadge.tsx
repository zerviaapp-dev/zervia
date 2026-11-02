/**
 * DORMANT — removed from all surfaces in the connector model
 * (Oct 2026). Zervia does not take or protect payments for a
 * provider's service, so the old badge copy was retired (keys deleted
 * from all locale files). Kept as a null stub so any stale import
 * renders nothing instead of a false promise; the original is in git
 * history for the booking re-entry gate.
 */
export async function PaymentProtectedBadge(_props: {
  locale: string;
  variant?: 'chip' | 'banner';
}) {
  void _props;
  return null;
}
