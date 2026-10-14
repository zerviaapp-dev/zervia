'use client';

import { Link } from '@/i18n/routing';

/**
 * Global error boundary. Catches unexpected errors in any route segment
 * and shows a friendly recovery page instead of a blank screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-5 py-16 text-center">
      <p className="text-7xl font-extrabold text-brand-200">!</p>
      <h1 className="mt-4 text-3xl font-extrabold text-brand-950">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-lg text-slate-600">
        We hit an unexpected error. Please try again — and if it keeps
        happening, let us know.
      </p>
      {error.digest ? (
        <p className="mt-2 text-sm text-slate-400">
          Error reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-lg font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
