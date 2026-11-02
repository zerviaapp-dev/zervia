/**
 * Notification preference keys and defaults.
 *
 * Lives in its own module (no 'use server') because 'use server' modules
 * may only export async functions — these constants are shared by server
 * actions, client components and lib/notify.ts.
 */

/** The notification categories a user can toggle. */
export const NOTIFICATION_PREF_KEYS = [
  'booking_updates',
  'new_messages',
  'offer_alerts',
  'price_drops',
  'referral_updates',
  'marketing',
] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

/** Defaults applied when a profile has no stored prefs (or migration 0028 not yet applied). */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  booking_updates: true,
  new_messages: true,
  offer_alerts: true,
  price_drops: true,
  referral_updates: true,
  marketing: false,
};
