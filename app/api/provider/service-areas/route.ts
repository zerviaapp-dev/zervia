import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  checkServiceAreaCount,
  resolveProviderTier,
} from '@/lib/provider-tiers';

/**
 * GPS-verified service areas for Community providers (Karrot
 * amendment §7a, Oct 21, 2026).
 *
 * POST { label, latitude, longitude } — the coordinates come from the
 * provider's own device GPS while they are physically present in the
 * area (the browser captures the fix; the server records it with a
 * timestamp). Max 2 areas (lib/provider-tiers + DB trigger in
 * migration 0052). Location verification says NOTHING about identity.
 *
 * Requires migration 0052 (owner step): without the tables/column the
 * endpoints return 503 instead of guessing.
 */

async function context() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ ok: false, message: 'Service unavailable' }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 }) };
  const { data: provider, error } = await supabase
    .from('providers')
    .select('id, provider_tier')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    return { error: NextResponse.json({ ok: false, code: 'migration_pending', message: 'Provider tiers are not enabled yet.' }, { status: 503 }) };
  }
  if (!provider) {
    return { error: NextResponse.json({ ok: false, message: 'Not a provider' }, { status: 403 }) };
  }
  return { supabase, provider };
}

export async function GET() {
  const ctx = await context();
  if ('error' in ctx) return ctx.error;
  const { data, error } = await ctx.supabase
    .from('community_service_areas')
    .select('id, label, latitude, longitude, verified_at')
    .eq('provider_id', ctx.provider.id)
    .order('verified_at', { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, code: 'migration_pending', message: 'Service areas are not enabled yet.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, areas: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await context();
  if ('error' in ctx) return ctx.error;
  if (resolveProviderTier(ctx.provider) !== 'community') {
    return NextResponse.json({ ok: false, message: 'Service-area verification is for Community providers.' }, { status: 403 });
  }
  let body: { label?: string; latitude?: number; longitude?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }
  const label = String(body.label ?? '').trim().slice(0, 120);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!label) {
    return NextResponse.json({ ok: false, message: 'Area label is required.' }, { status: 400 });
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ ok: false, message: 'A GPS location is required — verify while you are physically in the area.' }, { status: 400 });
  }

  const { count, error: countError } = await ctx.supabase
    .from('community_service_areas')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', ctx.provider.id);
  if (countError) {
    return NextResponse.json({ ok: false, code: 'migration_pending', message: 'Service areas are not enabled yet.' }, { status: 503 });
  }
  if (!checkServiceAreaCount(count ?? 0)) {
    return NextResponse.json({ ok: false, message: 'You already verified 2 service areas — the Community maximum. Remove one first.' }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from('community_service_areas')
    .insert({ provider_id: ctx.provider.id, label, latitude, longitude })
    .select('id, label, latitude, longitude, verified_at')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, message: 'Could not save the service area.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, area: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await context();
  if ('error' in ctx) return ctx.error;
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ ok: false, message: 'Missing area id.' }, { status: 400 });
  const { error } = await ctx.supabase
    .from('community_service_areas')
    .delete()
    .eq('id', id)
    .eq('provider_id', ctx.provider.id);
  if (error) {
    return NextResponse.json({ ok: false, message: 'Could not remove the service area.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
