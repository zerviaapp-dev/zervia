'use server';

import { getTranslations } from 'next-intl/server';
import { createClient } from './server';
import { defaultLocale } from '@/lib/locales';
import type { ActionResult } from './actions';
import {
  NOTIFICATION_PREF_KEYS,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefKey,
  type NotificationPrefs,
} from './notification-pref-keys';


function localeOf(formData: FormData): string {
  const raw = formData.get('locale');
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultLocale;
}

async function notificationsT(locale: string) {
  return getTranslations({ locale, namespace: 'Notifications' });
}

function normalizePrefs(raw: unknown): NotificationPrefs {
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  if (raw && typeof raw === 'object') {
    for (const key of NOTIFICATION_PREF_KEYS) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'boolean') out[key] = v;
    }
  }
  return out;
}

/** Read the caller's notification preferences (defaults when unset). */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const supabase = await createClient();
  if (!supabase) return { ...DEFAULT_NOTIFICATION_PREFS };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...DEFAULT_NOTIFICATION_PREFS };
  const { data } = await supabase
    .from('profiles')
    .select('notification_prefs')
    .eq('id', user.id)
    .maybeSingle();
  // Column may not exist yet if migration 0028 hasn't run — fall back to defaults.
  return normalizePrefs(
    (data as { notification_prefs?: unknown } | null)?.notification_prefs
  );
}

/**
 * Save the caller's notification preferences. Only known keys are stored;
 * unknown form fields are ignored.
 */
export async function saveNotificationPrefs(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const locale = localeOf(formData);
  const t = await notificationsT(locale);
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: t('prefsSaveError') };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t('prefsSaveError') };

  const prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of NOTIFICATION_PREF_KEYS) {
    // Checkboxes only submit when checked.
    prefs[key] = formData.get(key) === 'on';
  }

  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs })
    .eq('id', user.id);

  if (error) {
    return { ok: false, message: t('prefsSaveError') };
  }
  return { ok: true, message: t('prefsSaved') };
}
