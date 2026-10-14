'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/** Brand submit button with a pending state (56px tap target). */
export function SubmitButton({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-brand-700 hover:shadow-lg active:scale-[0.98] active:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {pending ? '…' : children}
    </button>
  );
}
