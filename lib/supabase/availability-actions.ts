'use server';

import { revalidatePath } from 'next/cache';
import { createClient, isSupabaseConfigured } from './server';
import { defaultLocale } from '@/lib/locales';
import type { ActionResult } from './actions';


const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function timeOk(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

async function providerIdFor(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .single();
  return data?.id ?? null;
}

/**
 * Replace the provider's weekly schedule. Slots arrive as form fields
 * `slot_<weekday>` = "HH:MM-HH:MM" (one slot per weekday; unchecked days
 * are simply omitted). Defence in depth: provider ownership is enforced
 * by RLS as well.
 */
export async function saveAvailability(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Supabase is not configured.' };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: 'Please sign in.' };
  }

  const providerId = await providerIdFor(supabase, user.id);
  if (!providerId) {
    return { ok: false, message: 'No provider profile found.' };
  }

  const rows: { provider_id: string; weekday: number; start_time: string; end_time: string }[] =
    [];
  for (const day of WEEKDAYS) {
    const raw = str(formData, `slot_${day}`);
    if (!raw) continue;
    const m = raw.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!m || !timeOk(m[1]) || !timeOk(m[2]) || m[2] <= m[1]) {
      return { ok: false, message: 'Invalid time range. Use HH:MM-HH:MM.' };
    }
    rows.push({ provider_id: providerId, weekday: day, start_time: m[1], end_time: m[2] });
  }

  const { error: delErr } = await supabase
    .from('availability')
    .delete()
    .eq('provider_id', providerId);
  if (delErr) {
    return { ok: false, message: 'Could not save availability.' };
  }
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('availability').insert(rows);
    if (insErr) {
      return { ok: false, message: 'Could not save availability.' };
    }
  }

  const locale = localeOf(formData);
  revalidatePath(`/${locale}/app/provider/availability`);
  return { ok: true, message: 'Availability saved.' };
}

/**
 * Set (or clear) the provider's next-available date. YYYY-MM-DD or empty.
 */
export async function setNextAvailableDate(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Supabase is not configured.' };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: 'Please sign in.' };
  }

  const raw = str(formData, 'next_available_date');
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, message: 'Invalid date.' };
  }

  const { error } = await supabase
    .from('providers')
    .update({ next_available_date: raw || null })
    .eq('user_id', user.id);
  if (error) {
    return { ok: false, message: 'Could not save date.' };
  }

  const locale = localeOf(formData);
  revalidatePath(`/${locale}/app/provider/availability`);
  return { ok: true, message: 'Saved.' };
}
