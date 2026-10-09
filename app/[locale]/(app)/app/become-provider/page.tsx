import { redirect } from 'next/navigation';
import { localizedPath } from '@/lib/locale-path';

/**
 * Legacy redirect: /app/become-provider → /app/provider/onboarding.
 * Kept so old links and bookmarks keep working. In-app links now point
 * directly at the onboarding wizard (see billing/page.tsx).
 */
export default async function BecomeProviderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(localizedPath('/app/provider/onboarding', locale));
}
