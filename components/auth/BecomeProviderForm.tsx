'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { requestProviderIntent, type ActionResult } from '@/lib/supabase/actions';
import { SubmitButton } from './SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/** Phase 1 stub: one-tap request that records the provider intent as pending. */
export function BecomeProviderForm() {
  const ta = useTranslations('Account');
  const locale = useLocale();
  const [state, formAction] = useActionState(requestProviderIntent, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      {state.message ? (
        <p
          role="status"
          className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800"
        >
          {state.message}
        </p>
      ) : null}
      <SubmitButton>{ta('becomeButton')}</SubmitButton>
    </form>
  );
}
