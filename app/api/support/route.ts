import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { takeAsync } from '@/lib/rate-limit';
import { validateSupportBody } from '@/lib/support-validation';

/**
 * POST /api/support — submit a support message.
 * Public endpoint (no auth; the form is on the marketing site).
 * Rate-limited per IP. RLS allows anonymous insert; only admins can read.
 *
 * Body validation is delegated to lib/support-validation.ts (pure,
 * unit-tested): malformed bodies (null, non-object, non-string fields,
 * missing fields) return 400 with a clear error — never a 500.
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // P1-4: object + string type guards run BEFORE any .trim() — a null
  // body or a non-string field (e.g. {"name": 123}) is a 400, never a
  // 500.
  const parsed = validateSupportBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, email, topic, message } = parsed.value;

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

  // §7b: first contact with a Community provider stays inside
  // Zervia — strip outside URLs from a first match message naming a
  // Community provider, so the exchange (and its safety record) is
  // not moved off-platform. Best-effort: the provider name appears in
  // parentheses in the Path B message format.
  let finalMessage = message;
  if (topic === 'match' && /https?:\/\//i.test(message)) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const admin = createAdminClient();
      if (admin) {
        const nameMatch = message.match(/\(([^)]{2,120})\)/);
        if (nameMatch) {
          const { data: prov } = await admin
            .from('providers')
            .select('provider_tier')
            .eq('business_name', nameMatch[1])
            .maybeSingle();
          if ((prov as { provider_tier?: string | null } | null)?.provider_tier === 'community') {
            finalMessage = message.replace(/https?:\/\/\S+/gi, '[link removed — first contact stays on Zervia]');
          }
        }
      }
    } catch {
      /* link stripping is best-effort */
    }
  }

  const { error } = await supabase.from('support_messages').insert({
    user_id: userId,
    name,
    email,
    topic,
    message: finalMessage,
  });

  if (error) {
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
