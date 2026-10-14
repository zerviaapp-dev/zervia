import { Link } from '@/i18n/routing';

/**
 * Global 404 page. Shown for any unmatched route.
 * Branded, friendly, with clear navigation back to safety.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-5 py-16 text-center">
      <p className="text-7xl font-extrabold text-brand-200">404</p>
      <h1 className="mt-4 text-3xl font-extrabold text-brand-950">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-lg text-slate-600">
        The page you&apos;re looking for doesn&apos;t exist or was moved.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Go home
        </Link>
        <Link
          href="/discover"
          className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-lg font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          Browse services
        </Link>
      </div>
    </div>
  );
}
