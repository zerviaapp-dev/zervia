/**
 * Health check. Used by hosting monitors and the founder's
 * "is it alive?" test. Reports the live feature surface so the
 * response proves which build is deployed.
 */
export async function GET() {
  return Response.json({
    ok: true,
    version: '1.0.0',
    features: [
      'auth',
      'bookings',
      'listings',
      'reviews',
      'rewards',
      'billing',
      'admin',
      'signup',
      'i18n-10-locales',
      'pwa',
    ],
  });
}
