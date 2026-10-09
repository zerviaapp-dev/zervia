import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ZMark } from '@/components/ZMark';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { createClient } from '@/lib/supabase/server';

/**
 * Logged-in app shell: brand header with nav (Home / Profile) and sign-out.
 * Route protection itself lives in middleware; this layout is defence in depth
 * and never crashes when Supabase isn't configured yet.
 */
export default async function AppShell({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Account' });
  const supabase = await createClient();
  const authed = supabase
    ? Boolean((await supabase.auth.getUser()).data.user)
    : false;

  // Unread notification count for the bell badge (0 when signed out or
  // when Supabase isn't configured yet — never a crash).
  let unread = 0;
  if (authed && supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      unread = count ?? 0;
    }
  }

  return (
    <div className="min-h-screen bg-brand-50">
      <header className="border-b border-brand-100 bg-white">
        <div className="mx-auto flex min-h-[64px] max-w-3xl items-center justify-between px-4">
          <Link href="/app/dashboard" className="flex items-center gap-2">
            <ZMark />
            <span className="text-xl font-bold text-brand-800">Zervia</span>
          </Link>
          {authed ? (
            <nav className="flex items-center gap-1 text-base">
              <Link
                href="/app/dashboard"
                className="inline-flex min-h-[44px] items-center rounded-full px-4 font-semibold text-brand-700"
              >
                {t('appNavHome')}
              </Link>
              <Link
                href="/app/bookings"
                className="inline-flex min-h-[44px] items-center rounded-full px-4 font-semibold text-brand-700"
              >
                {t('appNavBookings')}
              </Link>
              <Link
                href="/app/notifications"
                aria-label={t('appNavNotifications')}
                className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3 font-semibold text-brand-700"
              >
                <span aria-hidden="true" className="text-xl">
                  🔔
                </span>
                {unread > 0 ? (
                  <span className="absolute right-0 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/app/rewards"
                className="inline-flex min-h-[44px] items-center rounded-full px-4 font-semibold text-brand-700"
              >
                {t('appNavRewards')}
              </Link>
              <Link
                href="/app/billing"
                className="inline-flex min-h-[44px] items-center rounded-full px-4 font-semibold text-brand-700"
              >
                {t('appNavBilling')}
              </Link>
              <Link
                href="/app/profile"
                className="inline-flex min-h-[44px] items-center rounded-full px-4 font-semibold text-brand-700"
              >
                {t('appNavProfile')}
              </Link>
              <SignOutButton locale={locale} />
            </nav>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
