import { createClient } from './server';

/**
 * Bookable time slots for a listing, derived from the provider's weekly
 * availability schedule minus already-booked times.
 *
 * Mirrors the server-side guards in `requestBooking` (booking-actions.ts):
 * a slot is offered only if it starts more than 30 minutes in the future
 * and no pending/confirmed booking on the same listing falls within ±1 hour.
 *
 * Times are generated the same way the booking form submits them
 * (YYYY-MM-DD + HH:MM, interpreted server-side), so a picked slot always
 * passes validation.
 */

export type DaySlots = {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = Sunday
  slots: string[]; // HH:MM, hourly starts within the day's range
};

type AvailabilityRow = {
  weekday: number;
  start_time: string;
  end_time: string;
};

type BookingRow = {
  scheduled_at: string;
};

const SLOT_DAYS = 14;
const CLASH_WINDOW_MS = 60 * 60 * 1000;
const MIN_LEAD_MS = 30 * 60 * 1000;

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseTime(t: string): number | null {
  const m = t.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Hourly slot starts (HH:MM) inside [startMin, endMin). */
function hourlySlots(startMin: number, endMin: number): string[] {
  const out: string[] = [];
  // Start at the next whole hour at or after startMin.
  let cur = Math.ceil(startMin / 60) * 60;
  for (; cur + 60 <= endMin; cur += 60) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0');
    const m = String(cur % 60).padStart(2, '0');
    out.push(`${h}:${m}`);
  }
  return out;
}

/**
 * Next `days` days of bookable slots for a listing. Returns an empty
 * array when the provider has no weekly schedule (caller falls back to
 * manual date entry) or when the listing is not found.
 */
export async function getBookableSlots(
  listingId: string,
  days: number = SLOT_DAYS,
): Promise<DaySlots[]> {
  const supabase = await createClient();
  if (!supabase || !listingId) return [];

  const { data: listing } = await supabase
    .from('listings')
    .select('id, provider_id')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing) return [];

  // Public read (RLS "Public reads availability").
  const { data: availability } = (await supabase
    .from('availability')
    .select('weekday, start_time, end_time')
    .eq('provider_id', listing.provider_id)) as {
    data: AvailabilityRow[] | null;
  };
  if (!availability || availability.length === 0) return [];

  const byWeekday = new Map<number, AvailabilityRow>();
  for (const row of availability) {
    if (!byWeekday.has(row.weekday)) byWeekday.set(row.weekday, row);
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Existing live bookings on this listing inside the window.
  // (RLS admits public reads of scheduled times for bookable listings;
  // if the read fails we treat the calendar as fully open — the server
  // action still enforces the clash guard on submit.)
  const { data: bookings } = (await supabase
    .from('bookings')
    .select('scheduled_at')
    .eq('listing_id', listingId)
    .in('status', ['pending', 'confirmed'])
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', horizon.toISOString())) as {
    data: BookingRow[] | null;
  };
  const bookedTimes = (bookings ?? [])
    .map((b) => new Date(b.scheduled_at).getTime())
    .filter((t) => !Number.isNaN(t));

  const result: DaySlots[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const weekday = day.getDay();
    const avail = byWeekday.get(weekday);
    if (!avail) continue;

    const startMin = parseTime(avail.start_time);
    const endMin = parseTime(avail.end_time);
    if (startMin === null || endMin === null || endMin <= startMin) continue;

    const dateStr = toDateString(day);
    const slots: string[] = [];
    for (const time of hourlySlots(startMin, endMin)) {
      const slotMs = new Date(`${dateStr}T${time}:00`).getTime();
      if (Number.isNaN(slotMs)) continue;
      if (slotMs <= now.getTime() + MIN_LEAD_MS) continue;
      const clashes = bookedTimes.some(
        (t) => Math.abs(t - slotMs) < CLASH_WINDOW_MS,
      );
      if (!clashes) slots.push(time);
    }
    result.push({ date: dateStr, weekday, slots });
  }
  return result;
}
