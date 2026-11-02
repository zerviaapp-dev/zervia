import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * File a First-Session Guarantee claim — DISABLED.
 *
 * Oct 20, 2026 connector-model decision: Zervia retired the guarantee
 * (it no longer promises refunds on a provider's work — see the
 * /guarantee replacement page). This endpoint stays disabled and says
 * so ('guarantee_disabled', matching the eligibility route); it must
 * never describe the guarantee as "coming soon" again (MED-3).
 * Gated by SERVICE_BOOKING_LIVE via lib/booking-flag.ts — claims stay
 * disabled while the connector model is in force, and re-enabling
 * booking/escrow at all requires the documented re-entry gate (lawyer
 * opinion + insurance + staffed dispute process + founder GO).
 */
export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json(
    { error: 'guarantee_disabled' },
    { status: 503 }
  );
}
