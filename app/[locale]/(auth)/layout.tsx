import { Link } from '@/i18n/routing';
import { ZMark } from '@/components/ZMark';

/**
 * Centered card layout for all auth screens: logo up top,
 * white card, blue-and-white, mobile-first.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-brand-50 px-4 py-10">
      <Link href="/" aria-label="Zervia home">
        <ZMark />
      </Link>
      <div className="mt-6 w-full max-w-md rounded-3xl bg-white p-6 shadow sm:p-8">
        {children}
      </div>
    </div>
  );
}
