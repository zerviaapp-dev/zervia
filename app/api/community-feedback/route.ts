import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { takeAsync } from '@/lib/rate-limit';

/**
 * POST /api/community-feedback — "Community feedback" for Community
 * providers (two-tier spec §4 + Karrot §7d).
 *
 * Eligibility: the author must have sent a contact/match request to
 * this provider through Zervia (a support_messages row with topic
 * 'match' whose message names the provider — the Path B form format).
 * Feedback is stored in community_feedback (migration 0052), NEVER in
 * reviews — it must never be labelled a verified-booking review, and
 * it does not touch providers.rating_avg / review_count.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await takeAsync(`community-feedback:${ip}`, 5, 60_000))) {
    return NextResponse.json({ ok: false, message: 'Too many attempts. Please try again in a minute.' }, { status: 429 });
  }

  let body: { providerId?: string; rating?: number; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }
  const providerId = String(body.providerId ?? '');
  const rating = Number(body.rating);
  const text = String(body.text ?? '').trim().slice(0, 2000);
  if (!providerId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, message: 'A provider and a 1–5 rating are required.' }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: 'Service unavailable' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: 'Sign in to leave feedback.' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: 'Service unavailable' }, { status: 503 });
  }

  const { data: provider, error: providerError } = await admin
    .from('providers')
    .select('id, business_name, provider_tier')
    .eq('id', providerId)
    .maybeSingle();
  if (providerError) {
    // provider_tier column missing (migration 0052 pending).
    return NextResponse.json({ ok: false, code: 'migration_pending', message: 'Community feedback is not enabled yet.' }, { status: 503 });
  }
  if (!provider || provider.provider_tier !== 'community') {
    return NextResponse.json({ ok: false, message: 'Feedback here is for Community providers only.' }, { status: 400 });
  }

  // Eligibility: a prior match/contact request from this user naming
  // this provider. The Path B form writes
  // "Match request for listing: <title> (<business name>)".
  const { data: requests } = await admin
    .from('support_messages')
    .select('id')
    .eq('user_id', user.id)
    .eq('topic', 'match')
    .ilike('message', `%(${provider.business_name})%`)
    .limit(1);
  if (!requests || requests.length === 0) {
    return NextResponse.json(
      { ok: false, code: 'not_eligible', message: 'Only people who contacted this provider through Zervia can leave feedback.' },
      { status: 403 }
    );
  }

  const { error } = await admin.from('community_feedback').insert({
    provider_id: providerId,
    author_id: user.id,
    support_message_id: requests[0].id,
    rating,
    text: text || null,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: false, message: 'You already left feedback for this provider.' }, { status: 409 });
    }
    if (['42P01', 'PGRST205', '42703', 'PGRST204'].includes((error as { code?: string }).code || '')) {
      return NextResponse.json({ ok: false, code: 'migration_pending', message: 'Community feedback is not enabled yet.' }, { status: 503 });
    }
    console.error('[community-feedback] insert failed:', error);
    return NextResponse.json({ ok: false, message: 'Could not save feedback.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
