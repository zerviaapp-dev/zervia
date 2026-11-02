'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  saveNotificationPrefs
} from '@/lib/supabase/notification-actions';
import type { ActionResult } from '@/lib/supabase/actions';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
} from '@/lib/supabase/notification-pref-keys';
import { SubmitButton } from '@/components/auth/SubmitButton';

const initialState: ActionResult = { ok: false, message: '' };

/**
 * Notification preference toggles. Checkboxes submit only when checked;
 * the server action treats a missing key as false. Stored on profiles
 * (migration 0028); actual push delivery is future work.
 */
export function NotificationPreferences({
  initial,
}: {
  initial: NotificationPrefs;
}) {
  const t = useTranslations('Notifications');
  const locale = useLocale();
  const [state, formAction] = useActionState(saveNotificationPrefs, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />

      {state.message ? (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            state.ok ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="space-y-1">
        {NOTIFICATION_PREF_KEYS.map((key) => (
          <label
            key={key}
            className="flex min-h-[56px] cursor-pointer items-center justify-between gap-4 rounded-2xl px-2 py-2 hover:bg-brand-50"
          >
            <span>
              <span className="block text-base font-semibold text-brand-900">
                {t(`pref_${key}_title`)}
              </span>
              <span className="block text-sm text-brand-700">
                {t(`pref_${key}_desc`)}
              </span>
            </span>
            <input
              type="checkbox"
              name={key}
              defaultChecked={initial[key]}
              className="h-7 w-7 shrink-0 accent-brand-600"
            />
          </label>
        ))}
      </div>

      <p className="text-sm text-brand-700">{t('prefsPushNote')}</p>

      <SubmitButton>{t('prefsSave')}</SubmitButton>
    </form>
  );
}
