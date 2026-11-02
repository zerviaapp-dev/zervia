/**
 * DORMANT — first-party booking model only.
 *
 * This card showed a provider's held customer payments. In the
 * connector model (Oct 2026) Zervia never holds customer money, so
 * the card renders nothing. It is rendered by the provider dashboard
 * only when isServiceBookingLive() is true, and the original
 * implementation is preserved in git history for the re-entry gate.
 */
export async function HeldEscrowCard(_props: {
  providerId: string;
  locale: string;
}) {
  void _props;
  return null;
}
