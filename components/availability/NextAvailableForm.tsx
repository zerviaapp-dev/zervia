'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { setNextAvailableDate } from '@/lib/supabase/availability-actions';

/**
 * Next-available date picker. Empty = flexible (no constraint).
 */
export function NextAvailableForm({
  locale,
  initial,
}: {
  locale: string;
  initial: string;
}) {
  const t = useTranslations('Availability');
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setDone(false);
    const fd = new FormData();
    fd.append('locale', locale);
    fd.append('next_available_date', value);
    const res = await setNextAvailableDate(fd);
    setSaving(false);
    if (!res.ok) {
      setError(res.message || t('saveFailed'));
      return;
    }
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-center gap-3">
      <label htmlFor="next-available" className="sr-only">
        {t('nextLabel')}
      </label>
      <input
        id="next-available"
        type="date"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDone(false);
        }}
        className="min-h-[56px] rounded-2xl border-2 border-brand-200 bg-white px-4 text-base text-brand-900"
      />
      <button
        type="button"
        onClick={() => {
          setValue('');
          setDone(false);
        }}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-sm font-semibold text-brand-700 hover:bg-brand-50"
      >
        {t('clearDate')}
      </button>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {saving ? t('saving') : t('saveDate')}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="w-full text-sm font-semibold text-green-700">
          {t('saved')}
        </p>
      )}
    </form>
  );
}
