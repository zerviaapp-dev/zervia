'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { VisualDatePicker } from '@/components/forms/VisualDatePicker';

/**
 * Path B — "Ask Zervia to match me" (connector model, layout L1).
 * NOT a booking: no payment, no availability promise. The request is
 * stored as a support message with topic "match"; the team replies by
 * email with provider options. Includes the structured accessibility /
 * family-needs field (audit Z-H6).
 */
export function MatchRequestForm({
  listingTitle,
  providerName,
}: {
  listingTitle: string;
  providerName: string;
}) {
  const t = useTranslations('Connect');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [what, setWhat] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [accessibility, setAccessibility] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    const message = [
      `Match request for listing: ${listingTitle} (${providerName})`,
      `What I need: ${what}`,
      `Location: ${location || '—'}`,
      `Preferred date: ${date || '—'}`,
      `Accessibility / family needs: ${accessibility || '—'}`,
    ].join('\n');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic: 'match', message }),
      });
      const data = await res.json().catch(() => ({}));
      setStatus(res.ok && data.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div role="status" className="rounded-2xl bg-green-50 px-5 py-4">
        <p className="text-base font-bold text-green-900">{t('matchSuccessTitle')}</p>
        <p className="mt-1 text-sm text-green-800">{t('matchSuccessText')}</p>
      </div>
    );
  }

  const inputCls =
    'min-h-[56px] w-full rounded-2xl border-2 border-brand-100 bg-white px-4 py-3 text-base text-brand-900 placeholder:text-slate-600 focus:border-brand-600 focus:outline-none';
  const labelCls = 'mb-1 block text-sm font-semibold text-brand-800';

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="match-what" className={labelCls}>{t('matchWhatLabel')}</label>
        <textarea
          id="match-what"
          required
          maxLength={1500}
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder={t('matchWhatPlaceholder')}
          className={`${inputCls} min-h-[96px]`}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="match-location" className={labelCls}>{t('matchLocationLabel')}</label>
          <input
            id="match-location"
            maxLength={120}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputCls}
          />
        </div>
        <VisualDatePicker
          id="match-date"
          label={t('matchDateLabel')}
          value={date}
          onChange={setDate}
        />
        <div>
          <label htmlFor="match-accessibility" className={labelCls}>{t('matchAccessibilityLabel')}</label>
          <input
            id="match-accessibility"
            maxLength={300}
            value={accessibility}
            onChange={(e) => setAccessibility(e.target.value)}
            placeholder={t('matchAccessibilityPlaceholder')}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="match-name" className={labelCls}>{t('matchNameLabel')}</label>
          <input
            id="match-name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="match-email" className={labelCls}>{t('matchEmailLabel')}</label>
          <input
            id="match-email"
            type="email"
            required
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      {status === 'error' ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {t('matchError')}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {t('matchSubmit')}
      </button>
      <p className="text-xs text-brand-500">{t('matchNote')}</p>
    </form>
  );
}
