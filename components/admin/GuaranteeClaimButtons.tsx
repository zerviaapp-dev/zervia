'use client';

import { useState, useTransition } from 'react';
import {
  approveGuaranteeClaim,
  rejectGuaranteeClaim,
} from '@/lib/supabase/guarantee-admin-actions';

/**
 * Admin approve/reject controls for a guarantee claim.
 * Approve refunds the customer from Zervia operating funds —
 * the provider payout is never clawed back.
 */
export function GuaranteeClaimButtons({
  claimId,
  locale,
}: {
  claimId: string;
  locale: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMessage(null);
              const result = await approveGuaranteeClaim(claimId, locale);
              setMessage(result.ok ? `✓ ${result.message}` : `Failed: ${result.message}`);
            })
          }
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Processing…' : 'Approve & refund customer'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setRejecting((v) => !v)}
          className="rounded-full border-2 border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition-all hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject
        </button>
      </div>

      {rejecting && (
        <div className="space-y-2 rounded-2xl bg-red-50 p-3">
          <label className="block text-sm font-medium text-red-900">
            Internal rejection note (required)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 block w-full rounded-xl border border-red-200 px-3 py-2 text-sm"
              placeholder="Why is this claim being rejected?"
            />
          </label>
          <button
            type="button"
            disabled={pending || note.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const result = await rejectGuaranteeClaim(claimId, note, locale);
                setMessage(result.ok ? `✓ ${result.message}` : `Failed: ${result.message}`);
                if (result.ok) setRejecting(false);
              })
            }
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Processing…' : 'Confirm rejection'}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`text-sm ${message.startsWith('✓') ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
