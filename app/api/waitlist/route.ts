import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { takeAsync } from '@/lib/rate-limit';

type WaitlistBody = {
  email?: string;
  name?: string;
  role?: string;
  city?: string;
  country?: string;
  locale?: string;
  referral_code?: string;
};

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const VALID_ROLES = ['client', 'provider', 'both'];

/**
 * POST /api/waitlist — join the Zervia waitlist.
 * Public endpoint (no auth). Rate-limited per IP. RLS allows anonymous insert.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await takeAsync(`waitlist:${ip}`, 5, 60_000))) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again in a minute.' },
      { status: 429 }
    );
  }

  let body: WaitlistBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 }
    );
  }

  const role = (body.role ?? 'client').trim();
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable.' },
      { status: 503 }
    );
  }
  const { error } = await supabase.from('waitlist').insert({
    email,
    name: (body.name ?? '').trim().slice(0, 120) || null,
    role,
    city: (body.city ?? '').trim().slice(0, 120) || null,
    country: (body.country ?? '').trim().slice(0, 2).toUpperCase() || null,
    locale: (body.locale ?? '').trim().slice(0, 10) || null,
    referral_code: (body.referral_code ?? '').trim().slice(0, 32) || null,
  });

  if (error) {
    // Unique violation = already on the list. Treat as success (idempotent).
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, already: true });
    }
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
