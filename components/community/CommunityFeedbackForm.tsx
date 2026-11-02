'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Community feedback form (spec §4): shown on Community listings to
 * signed-in users. The API enforces the real eligibility rule (a
 * prior Zervia contact/match request to this provider).
 */
export function CommunityFeedbackForm({ providerId }: { providerId: string }) {
  const t = useTranslations('Community');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/community-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, rating, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus('done');
      } else {
        setStatus('error');
        setErrorMsg(
          data.code === 'not_eligible' ? t('feedbackEligible') : data.message || 'Error'
        );
      }
    } catch {
      setStatus('error');
      setErrorMsg('Error');
    }
  }

  if (status === 'done') {
    return (
      <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-900">
        {t('feedbackThanks')}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="cf-rating" className="mb-1 block text-sm font-semibold text-brand-800">
          ★
        </label>
        <select
          id="cf-rating"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="min-h-[48px] rounded-2xl border-2 border-brand-100 bg-white px-4 py-2 text-base text-brand-900"
        >
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {'⭐'.repeat(r)}
            </option>
          ))}
        </select>
      </div>
      <textarea
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[80px] w-full rounded-2xl border-2 border-brand-100 bg-white px-4 py-3 text-base text-brand-900"
        aria-label={t('feedbackTitle')}
      />
      {status === 'error' ? (
        <p role="alert" className="text-sm font-medium text-red-700">{errorMsg}</p>
      ) : null}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {t('feedbackSubmit')}
      </button>
    </form>
  );
}
