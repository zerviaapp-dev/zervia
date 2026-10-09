'use client';

import { useLocale, useTranslations } from 'next-intl';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/supabase/booking-actions';

export type NotificationItem = {
  id: string;
  type: string;
  title_key: string;
  body_key: string;
  body_args: Record<string, string>;
  link: string | null;
  read: boolean;
  created_at: string;
};

/**
 * Notification inbox (client): lists the caller's notifications, marks
 * single items read, or clears all. Body text is interpolated from the
 * stored body_args ({listing}, {rating}, ...). Links are app-relative and
 * rendered through plain anchors — the locale prefix is added by the
 * server page that renders this component.
 */
export function NotificationList({
  items,
  localePrefix,
}: {
  items: NotificationItem[];
  localePrefix: string;
}) {
  const t = useTranslations('Notifications');
  const locale = useLocale();

  if (items.length === 0) {
    return <p className="text-base text-brand-700">{t('noNotifications')}</p>;
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-4">
      {unread > 0 ? (
        <form action={markAllNotificationsRead}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brand-200 bg-white px-5 text-sm font-semibold text-brand-700 hover:border-brand-400"
          >
            {t('markAllRead')}
          </button>
        </form>
      ) : null}

      {items.map((n) => {
        const href = n.link ? `${localePrefix}${n.link}` : null;
        const title = t.has(n.title_key as never)
          ? t(n.title_key as never)
          : n.title_key;
        const body = t.has(n.body_key as never)
          ? t(n.body_key as never, n.body_args as never)
          : n.body_key;
        return (
          <div
            key={n.id}
            className={`rounded-3xl border p-4 ${
              n.read
                ? 'border-brand-100 bg-white'
                : 'border-brand-300 bg-brand-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-bold text-brand-900">{title}</p>
                <p className="mt-1 text-sm text-brand-700">{body}</p>
                <p className="mt-1 text-xs text-brand-500">
                  {new Date(n.created_at).toLocaleString(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              {!n.read ? (
                <form action={markNotificationRead}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    aria-label={t('markRead')}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 hover:bg-brand-200"
                  >
                    ✓
                  </button>
                </form>
              ) : null}
            </div>
            {href ? (
              <a
                href={href}
                aria-label={title}
                className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-700 underline"
              >
                <span aria-hidden="true">→</span>
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
