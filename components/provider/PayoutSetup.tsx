'use client';

import { useState } from 'react';

type Props = {
  locale: string;
  showDashboardLink?: boolean;
};

/**
 * Client component for Stripe Connect actions:
 * - "Set up payouts" → creates onboarding link, redirects to Stripe
 * - "Open Stripe dashboard" → creates Express login link
 */
export function PayoutSetup({ locale, showDashboardLink }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Failed to start onboarding');
      }
      window.location.href = data.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  async function openDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/connect/dashboard-link', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Failed to open dashboard');
      }
      window.location.href = data.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {!showDashboardLink ? (
        <button
          onClick={startOnboarding}
          disabled={loading}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Starting…' : 'Set up payouts'}
        </button>
      ) : (
        <button
          onClick={openDashboard}
          disabled={loading}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          {loading ? 'Opening…' : 'Open Stripe dashboard'}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
