import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { takeAsync } from '@/lib/rate-limit';

type SupportBody = {
  name?: string;
  email?: string;
  topic?: string;
  message?: string;
};

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const VALID_TOPICS = ['general', 'account', 'booking', 'provider', 'trust'];

/**
 * POST /api/support — submit a support message.
 * Public endpoint (no auth; the form is on the marketing site).
 * Rate-limited per IP. RLS allows anonymous insert; only admins can read.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await takeAsync(`support:${ip}`, 5, 60_000))) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again in a minute.' },
      { status: 429 }
    );
  }

  let body: SupportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim().slice(0, 120);
  if (!name) {
    return NextResponse.json(
      { error: 'Please enter your name.' },
      { status: 400 }
    );
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 }
    );
  }

  const topic = (body.topic ?? 'general').trim();
  if (!VALID_TOPICS.includes(topic)) {
    return NextResponse.json({ error: 'Invalid topic.' }, { status: 400 });
  }

  const message = (body.message ?? '').trim().slice(0, 5000);
  if (!message) {
    return NextResponse.json(
      { error: 'Please write your message.' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable.' },
      { status: 503 }
    );
  }

  // Attach the sender's user id when signed in (optional, best-effort).
  let userId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const { error } = await supabase.from('support_messages').insert({
    user_id: userId,
    name,
    email,
    topic,
    message,
  });

  if (error) {
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
