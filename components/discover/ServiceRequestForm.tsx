'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Discover empty-state capture (MAJ-3 / MED-7, Oct 20, 2026).
 *
 * When a search finds no providers yet, the empty state must not be a
 * dead end: this form turns it into a lead. It posts to the EXISTING
 * /api/support endpoint with topic "service-request" (stored as a
 * support message for the Zervia team — no new backend table). The
 * team replies by email when a matching provider is live. It makes NO
 * availability or booking promise, matching the connector model.
 *
 * Field labels reuse the Connect "match" strings (already translated);
 * only the surrounding Discover strings are new.
 */
export function ServiceRequestForm({
  searchQuery = '',
  categoryLabel = '',
  subcategoryLabel = '',
}: {
  searchQuery?: string;
  categoryLabel?: string;
  subcategoryLabel?: string;
}) {
  const t = useTranslations('Discover');
  const tc = useTranslations('Connect');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [what, setWhat] = useState(searchQuery);
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    const message = [
      'Service request from a Discover search with no results yet.',
      `Searched for: ${searchQuery || '—'}`,
      `Category: ${categoryLabel || '—'}${subcategoryLabel ? ` / ${subcategoryLabel}` : ''}`,
      `What I need: ${what}`,
      `Location: ${location || '—'}`,
    ].join('\n');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic: 'service-request', message }),
      });
      const data = await res.json().catch(() => ({}));
      setStatus(res.ok && data.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div role="status" className="mx-auto mt-6 max-w-xl rounded-2xl bg-green-50 px-5 py-4 text-left">
        <p className="text-base font-bold text-green-900">{tc('matchSuccessTitle')}</p>
        <p className="mt-1 text-sm text-green-800">{tc('matchSuccessText')}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700"
      >
        {t('requestCta')}
      </button>
    );
  }

  const inputCls =
    'min-h-[56px] w-full rounded-2xl border-2 border-brand-100 bg-white px-4 py-3 text-base text-brand-900 placeholder:text-slate-600 focus:border-brand-600 focus:outline-none';
  const labelCls = 'mb-1 block text-sm font-semibold text-brand-800';

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-6 max-w-xl space-y-4 text-left">
      <p className="text-base font-bold text-brand-900">{t('requestFormTitle')}</p>
      <div>
        <label htmlFor="sr-what" className={labelCls}>{tc('matchWhatLabel')}</label>
        <textarea
          id="sr-what"
          required
          maxLength={1500}
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder={tc('matchWhatPlaceholder')}
          className={`${inputCls} min-h-[96px]`}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sr-location" className={labelCls}>{tc('matchLocationLabel')}</label>
          <input
            id="sr-location"
            maxLength={120}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="sr-name" className={labelCls}>{tc('matchNameLabel')}</label>
          <input
            id="sr-name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="sr-email" className={labelCls}>{tc('matchEmailLabel')}</label>
          <input
            id="sr-email"
            type="email"
            required
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <p className="text-sm text-brand-700">{tc('matchNote')}</p>
      {status === 'error' ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {tc('matchError')}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {tc('matchSubmit')}
      </button>
    </form>
  );
}
