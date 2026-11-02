'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { saveAvailability } from '@/lib/supabase/availability-actions';

const DAYS = [0, 1, 2, 3, 4, 5, 6]; // 0 = Sunday

/**
 * Weekly schedule editor. One optional time range per weekday;
 * unchecked days are closed. Submits the whole week at once.
 */
export function AvailabilityForm({
  locale,
  initial,
}: {
  locale: string;
  initial: Map<number, { start: string; end: string }>;
}) {
  const t = useTranslations('Availability');
  const [slots, setSlots] = useState<Map<number, { start: string; end: string }>>(
    () => new Map(initial),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function dayName(day: number): string {
    return t(`day_${day}`);
  }

  function toggle(day: number, on: boolean) {
    setDone(false);
    setSlots((prev) => {
      const next = new Map(prev);
      if (on) {
        next.set(day, { start: '09:00', end: '17:00' });
      } else {
        next.delete(day);
      }
      return next;
    });
  }

  function setTime(day: number, field: 'start' | 'end', value: string) {
    setDone(false);
    setSlots((prev) => {
      const next = new Map(prev);
      const cur = next.get(day) ?? { start: '09:00', end: '17:00' };
      next.set(day, { ...cur, [field]: value });
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setDone(false);
    const fd = new FormData();
    fd.append('locale', locale);
    for (const [day, range] of slots) {
      fd.append(`slot_${day}`, `${range.start}-${range.end}`);
    }
    const res = await saveAvailability(fd);
    setSaving(false);
    if (!res.ok) {
      setError(res.message || t('saveFailed'));
      return;
    }
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      {DAYS.map((day) => {
        const active = slots.has(day);
        const range = slots.get(day);
        return (
          <div
            key={day}
            className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/50 px-4 py-3"
          >
            <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => toggle(day, e.target.checked)}
                className="h-5 w-5 accent-brand-600"
              />
              <span className="text-base font-semibold text-brand-900">{dayName(day)}</span>
            </label>
            {active && range ? (
              <div className="flex items-center gap-1 text-sm">
                <input
                  type="time"
                  value={range.start}
                  onChange={(e) => setTime(day, 'start', e.target.value)}
                  className="rounded-xl border border-brand-200 bg-white px-2 py-2"
                  aria-label={t('startLabel', { day: dayName(day) })}
                />
                <span className="text-brand-600">–</span>
                <input
                  type="time"
                  value={range.end}
                  onChange={(e) => setTime(day, 'end', e.target.value)}
                  className="rounded-xl border border-brand-200 bg-white px-2 py-2"
                  aria-label={t('endLabel', { day: dayName(day) })}
                />
              </div>
            ) : (
              <span className="text-sm text-brand-500">{t('closed')}</span>
            )}
          </div>
        );
      })}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm font-semibold text-green-700">
          {t('saved')}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {saving ? t('saving') : t('saveSchedule')}
      </button>
    </form>
  );
}
