'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DaySlots } from '@/lib/supabase/slots';

/**
 * Customer-facing availability picker. Shows the next 14 days as
 * horizontally scrollable day chips; tapping a day reveals that day's
 * open hourly slots. Picking a slot reports (date, time) to the parent,
 * which fills the booking form's scheduled date/time.
 */
export function SlotPicker({
  days,
  selectedDate,
  selectedTime,
  onSelect,
}: {
  days: DaySlots[];
  selectedDate: string;
  selectedTime: string;
  onSelect: (date: string, time: string) => void;
}) {
  const t = useTranslations('Bookings');
  const ta = useTranslations('Availability');
  const [activeDate, setActiveDate] = useState<string>(
    days.find((d) => d.slots.length > 0)?.date ?? days[0]?.date ?? '',
  );

  const activeDay = days.find((d) => d.date === activeDate) ?? null;

  function dayLabel(d: DaySlots): string {
    const dt = new Date(`${d.date}T12:00:00`);
    const weekday = ta(`day_${d.weekday}`);
    const md = dt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    return `${weekday} ${md}`;
  }

  if (days.length === 0) {
    return (
      <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
        {t('noSlotsAvailable')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-base font-semibold text-brand-900">{t('pickSlot')}</p>

      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label={t('pickSlot')}
      >
        {days.map((d) => {
          const active = d.date === activeDate;
          const empty = d.slots.length === 0;
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveDate(d.date)}
              className={`min-h-[56px] min-w-[76px] shrink-0 rounded-2xl border-2 px-3 py-2 text-center text-sm font-semibold transition ${
                active
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-brand-200 bg-white text-brand-800 hover:border-brand-400'
              }`}
            >
              <span className="block">{dayLabel(d)}</span>
              <span
                className={`mt-0.5 block text-xs font-medium ${
                  active ? 'text-brand-100' : empty ? 'text-brand-400' : 'text-green-700'
                }`}
              >
                {empty
                  ? t('dayFullyBooked')
                  : t('slotsCount', { count: d.slots.length })}
              </span>
            </button>
          );
        })}
      </div>

      {activeDay ? (
        activeDay.slots.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('pickSlot')}>
            {activeDay.slots.map((time) => {
              const selected =
                selectedDate === activeDay.date && selectedTime === time;
              return (
                <button
                  key={time}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(activeDay.date, time)}
                  className={`inline-flex min-h-[48px] items-center justify-center rounded-full border-2 px-5 text-base font-semibold transition ${
                    selected
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-brand-200 bg-white text-brand-800 hover:border-brand-400'
                  }`}
                >
                  {time}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-brand-600">{t('dayFullyBooked')}</p>
        )
      ) : null}
    </div>
  );
}
