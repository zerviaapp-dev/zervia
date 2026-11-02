'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { blockProvider } from '@/lib/supabase/moderation-actions';
import type { ActionResult } from '@/lib/supabase/actions';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * Block this provider (spec §4): hides their listings from the
 * blocker's discover results. Personal only — not a moderation action.
 */
export function BlockButton({ providerId }: { providerId: string }) {
  const t = useTranslations('Community');
  const [blocked, setBlocked] = useState(false);
  const [, formAction] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const r = await blockProvider(prev, fd);
      if (r.ok) setBlocked(true);
      return r;
    },
    initialState
  );

  if (blocked) {
    return (
      <p role="status" className="inline-flex min-h-[56px] items-center rounded-full bg-brand-50 px-6 text-base font-semibold text-brand-800">
        {t('blockDone')}
      </p>
    );
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="providerId" value={providerId} />
      <button
        type="submit"
        className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50"
      >
        🚫 {t('blockCta')}
      </button>
    </form>
  );
}
