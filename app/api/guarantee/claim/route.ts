import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * File a First-Session Guarantee claim — DISABLED (Coming Soon).
 *
 * CEO directive Oct 2026: the guarantee program is not active yet.
 * The /guarantee page explains what's launching; this endpoint returns
 * 503 until launch. The provider is ALWAYS paid in full — refunds, once
 * an admin approves, come from Zervia operating funds via Stripe.
 *
 * To re-enable at launch: restore the original implementation from git
 * history (the commit that introduced this early return) — it performed
 * server-side auth, eligibility re-check, rate limiting, and the
 * race-safe UNIQUE(booking_id) insert.
 */
export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json(
    { error: 'guarantee_coming_soon' },
    { status: 503 }
  );
}
