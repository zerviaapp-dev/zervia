'use client';

import { useRef } from 'react';

/**
 * Visual calendar date picker (live-test fix batch Z1, Oct 20 2026).
 *
 * Liz's complaint was bare native spinbutton date entry — three little
 * number boxes you have to type into segment by segment. This wraps the
 * native date input (which every modern browser renders with a full
 * visual calendar popup) in a large, clearly-tappable field: tapping
 * anywhere on the field — including the big calendar button — opens
 * the calendar via showPicker(). Falls back to manual entry where
 * showPicker is unavailable.
 */
export function VisualDatePicker({
  id,
  label,
  value,
  onChange,
  required = false,
  minToday = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minToday?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  const openCalendar = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      // showPicker() opens the visual calendar in Chromium/Edge/Safari 16+.
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      el.focus();
    }
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-brand-800">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="date"
          value={value}
          required={required}
          min={minToday ? today : undefined}
          onChange={(e) => onChange(e.target.value)}
          onClick={openCalendar}
          className="visual-date-input min-h-[56px] w-full rounded-2xl border-2 border-brand-100 bg-white px-4 py-3 pr-16 text-base text-brand-900 focus:border-brand-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={openCalendar}
          aria-label={label}
          className="absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-r-2xl text-2xl"
        >
          <span aria-hidden="true">📅</span>
        </button>
      </div>
    </div>
  );
}
