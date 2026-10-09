'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';

type Status = 'idle' | 'sending' | 'done' | 'error';

const TOPICS = ['general', 'account', 'booking', 'provider', 'trust'] as const;

/**
 * Public "Contact support" form for the /support page.
 * Posts to /api/support (public, rate-limited). Mobile-first, 56px targets.
 */
export function SupportForm() {
  const t = useTranslations('Support');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>('general');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus('done');
      } else {
        setStatus('error');
        setErrorMsg(data.error ?? t('errorGeneric'));
      }
    } catch {
      setStatus('error');
      setErrorMsg(t('errorGeneric'));
    }
  }

  if (status === 'done') {
    return (
      <div
        role="status"
        className="mx-auto w-full max-w-md rounded-2xl bg-green-50 px-6 py-8 text-center"
      >
        <p className="text-2xl font-bold text-green-900">{t('successTitle')}</p>
        <p className="mt-2 text-lg text-green-800">{t('successText')}</p>
      </div>
    );
  }

  const inputCls =
    'min-h-[56px] w-full rounded-2xl border-2 border-brand-100 bg-white px-5 text-lg text-brand-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none';

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-md">
      <div className="flex flex-col gap-3">
        <div>
          <label
            htmlFor="support-name"
            className="mb-1 block text-base font-semibold text-brand-900"
          >
            {t('nameLabel')}
          </label>
          <input
            id="support-name"
            type="text"
            required
            autoComplete="name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('nameLabel')}
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="support-email"
            className="mb-1 block text-base font-semibold text-brand-900"
          >
            {t('emailLabel')}
          </label>
          <input
            id="support-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailLabel')}
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="support-topic"
            className="mb-1 block text-base font-semibold text-brand-900"
          >
            {t('topicLabel')}
          </label>
          <select
            id="support-topic"
            value={topic}
            onChange={(e) =>
              setTopic(e.target.value as (typeof TOPICS)[number])
            }
            className={`${inputCls} appearance-none`}
          >
            {TOPICS.map((tp) => (
              <option key={tp} value={tp}>
                {t(`topic${tp[0].toUpperCase()}${tp.slice(1)}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="support-message"
            className="mb-1 block text-base font-semibold text-brand-900"
          >
            {t('messageLabel')}
          </label>
          <textarea
            id="support-message"
            required
            rows={5}
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('messageLabel')}
            className="min-h-[140px] w-full rounded-2xl border-2 border-brand-100 bg-white px-5 py-4 text-lg text-brand-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none"
          />
        </div>
        <Button
          type="submit"
          disabled={status === 'sending'}
          className="mt-1 w-full"
        >
          {status === 'sending' ? t('sendingButton') : t('submitButton')}
        </Button>
        {status === 'error' && (
          <p role="alert" className="text-center text-base font-medium text-red-700">
            {errorMsg}
          </p>
        )}
      </div>
    </form>
  );
}
