import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { takeAsync } from '@/lib/rate-limit';
import { checkGuaranteeEligibility } from '@/lib/supabase/guarantee-actions';

export const runtime = 'nodejs';

type EligibilityBody = {
  bookingId?: string;
};

/**
 * Check whether the signed-in customer is eligible to file a
 * First-Session Guarantee claim for a booking.
 *
 * Eligibility is ALWAYS re-verified server-side — the claim endpoint
 * runs the same check and never trusts this response.
 * Rate-limited: 20 checks per user per minute (prevents enumeration).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!(await takeAsync(`guarantee-eligibility:${user.id}`, 20, 60_000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: EligibilityBody;
  try {
    body = (await req.json()) as EligibilityBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const bookingId = body.bookingId?.trim();
  if (!bookingId) {
    return NextResponse.json({ error: 'missing_booking' }, { status: 400 });
  }

  const result = await checkGuaranteeEligibility(supabase, bookingId, user.id);
  if (result.eligible) {
    return NextResponse.json({ eligible: true });
  }
  return NextResponse.json({
    eligible: false,
    reason: result.reason,
  });
}
