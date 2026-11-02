'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { signOut } from '@/lib/supabase/actions';

export function SignOutButton({ locale }: { locale: string }) {
  const t = useTranslations('Account');
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOut(locale))}
      className="inline-flex min-h-[44px] items-center rounded-full px-4 text-base font-semibold text-brand-700 underline disabled:opacity-60"
    >
      {t('signOut')}
    </button>
  );
}
