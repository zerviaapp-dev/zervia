'use client';

import { useActionState, useState } from 'react';
import { setCeoProductStatus, type CeoStatus } from '@/lib/supabase/ceo-actions';

const OPTIONS: { value: CeoStatus; emoji: string; label: string }[] = [
  { value: 'ready', emoji: '🟡', label: 'Ready to review' },
  { value: 'approved', emoji: '✅', label: 'Approved — ready to sell' },
  { value: 'needs_revision', emoji: '🔄', label: 'Needs revision' },
  { value: 'rejected', emoji: '❌', label: 'Rejected' },
];

export function CeoApprovalForm({
  slug,
  locale,
  currentStatus,
  currentNotes,
}: {
  slug: string;
  locale: string;
  currentStatus: CeoStatus;
  currentNotes: string | null;
}) {
  const [state, action, pending] = useActionState(setCeoProductStatus, { ok: false, message: '' });
  const [status, setStatus] = useState<CeoStatus>(currentStatus === 'draft' ? 'ready' : currentStatus);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="status" value={status} />

      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setStatus(o.value)}
            className={`rounded-xl border-2 px-3 py-2 text-sm font-medium text-left transition ${
              status === o.value
                ? 'border-blue-600 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {o.emoji} {o.label}
          </button>
        ))}
      </div>

      <textarea
        name="notes"
        rows={3}
        defaultValue={currentNotes ?? ''}
        placeholder="Notes for revision (optional)…"
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-blue-600 text-white font-semibold px-4 py-2.5 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save decision'}
      </button>

      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-green-600' : 'text-red-600'}`}>{state.message}</p>
      )}
    </form>
  );
}
