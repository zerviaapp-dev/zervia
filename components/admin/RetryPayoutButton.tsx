'use client';

import { useState, useTransition } from 'react';
import { retryPayout } from '@/lib/supabase/escrow-actions';

/** Admin-only button to retry a failed payout. */
export function RetryPayoutButton({ payoutId, locale }: { payoutId: string; locale: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await retryPayout(payoutId, locale);
            setMessage(result.ok ? 'Retried ✓' : `Failed: ${result.message}`);
          })
        }
        className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition-all hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Retrying…' : 'Retry payout'}
      </button>
      {message && (
        <span className={`text-xs ${message.startsWith('Retried') ? 'text-green-700' : 'text-red-700'}`}>
          {message}
        </span>
      )}
    </span>
  );
}
