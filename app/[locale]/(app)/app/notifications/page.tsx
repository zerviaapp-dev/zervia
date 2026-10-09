import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import {
  NotificationList,
  type NotificationItem,
} from '@/components/booking/NotificationList';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { defaultLocale } from '@/lib/locales';

/**
 * Notification inbox. Owner-only by RLS; the eq(user_id) is
 * belt-and-suspenders.
 */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Notifications' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizedPath('/login', locale));
  }

  const { data } = (await supabase
    .from('notifications')
    .select('id, type, title_key, body_key, body_args, link, read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)) as { data: NotificationItem[] | null };

  const localePrefix = locale === defaultLocale ? '' : `/${locale}`;

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
      <Panel>
        <NotificationList items={data ?? []} localePrefix={localePrefix} />
      </Panel>
    </div>
  );
}
