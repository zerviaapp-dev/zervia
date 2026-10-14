/**
 * Central notification dispatcher.
 *
 * One call fans out across every enabled channel, in this order:
 *   1. in-app notification row (always, when `inApp` is provided)
 *   2. WhatsApp (if configured, user opted in, pref allows, phone present)
 *   3. SMS      (if configured, pref allows, phone present)
 *
 * Channel selection respects the user's notification preferences
 * (notification_prefs on profiles, see lib/supabase/notification-actions.ts).
 * Verification codes are TRANSACTIONAL and bypass marketing prefs — they
 * still require a phone number on file.
 *
 * Usage (from a server action):
 *   await notifyUser({
 *     userId: booking.customer_id,
 *     event: 'booking_confirmed',
 *     params: { name, listing, date },
 *     inApp: { titleKey: 'Notifications.bookingConfirmedTitle',
 *              bodyKey: 'Notifications.bookingConfirmedBody',
 *              bodyArgs: { listing }, link: `/app/bookings/${id}` },
 *   });
 */

import { createClient } from './supabase/server';
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefKey,
} from './supabase/notification-pref-keys';
import {
  isWhatsAppConfigured,
  sendBookingConfirmed as waBookingConfirmed,
  sendBookingReminder as waBookingReminder,
  sendNewMessage as waNewMessage,
  sendOfferAlert as waOfferAlert,
} from './whatsapp';
import { isSmsConfigured, sendSMS, sendVerificationCodeSms } from './sms';
import { defaultLocale } from './locales';

export type NotifyEvent =
  | 'booking_request'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_completed'
  | 'booking_reminder'
  | 'new_message'
  | 'offer_alert'
  | 'price_drop'
  | 'referral_update'
  | 'review_received'
  | 'verification_code'
  | 'audit_passed'
  | 'audit_warning'
  | 'audit_suspended';

/** Event → notification_prefs key. `null` = transactional, always allowed. */
const EVENT_PREF: Record<NotifyEvent, NotificationPrefKey | null> = {
  booking_request: 'booking_updates',
  booking_confirmed: 'booking_updates',
  booking_cancelled: 'booking_updates',
  booking_completed: 'booking_updates',
  booking_reminder: 'booking_updates',
  new_message: 'new_messages',
  offer_alert: 'offer_alerts',
  price_drop: 'price_drops',
  referral_update: 'referral_updates',
  review_received: 'booking_updates',
  verification_code: null,
  // Audit notices are transactional quality notices, always delivered
  // in-app. External channels are skipped (no templates mapped) unless
  // the caller passes explicit channels.
  audit_passed: null,
  audit_warning: null,
  audit_suspended: null,
};

export interface InAppPayload {
  /** DB notifications.type value, e.g. 'booking_confirmed'. */
  type: string;
  titleKey: string;
  bodyKey: string;
  bodyArgs?: Record<string, string>;
  link?: string;
}

export interface NotifyOptions {
  userId: string;
  event: NotifyEvent;
  /** Interpolation values for message templates: name, listing, date, … */
  params: Record<string, string>;
  /** In-app row to insert (skipped when omitted). */
  inApp?: InAppPayload;
  /** External channels to attempt. Defaults to both. */
  channels?: Array<'whatsapp' | 'sms'>;
}

export interface NotifyResult {
  inApp: boolean;
  whatsapp: 'sent' | 'skipped' | 'failed' | 'not-configured';
  sms: 'sent' | 'skipped' | 'failed' | 'not-configured';
}

interface Recipient {
  prefs: Record<NotificationPrefKey, boolean>;
  phone: string | null;
  whatsappOptIn: boolean;
  locale: string;
  name: string;
}

async function loadRecipient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Recipient | null> {
  if (!supabase) return null;
  // phone / whatsapp_opt_in come from migration 0031 — select tolerantly
  // so the dispatcher keeps working before it is applied.
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_prefs, phone, whatsapp_opt_in, preferred_locale, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const prefs = { ...DEFAULT_NOTIFICATION_PREFS };
  const rawPrefs = row.notification_prefs;
  if (rawPrefs && typeof rawPrefs === 'object') {
    for (const k of Object.keys(prefs) as NotificationPrefKey[]) {
      const v = (rawPrefs as Record<string, unknown>)[k];
      if (typeof v === 'boolean') prefs[k] = v;
    }
  }
  return {
    prefs,
    phone: typeof row.phone === 'string' && row.phone ? row.phone : null,
    whatsappOptIn: row.whatsapp_opt_in !== false, // default opt-in
    locale:
      typeof row.preferred_locale === 'string' && row.preferred_locale
        ? row.preferred_locale
        : defaultLocale,
    name:
      typeof row.full_name === 'string' && row.full_name
        ? row.full_name.split(' ')[0]
        : 'there',
  };
}

/**
 * Fan-out a notification. Never throws — every channel failure is captured
 * in the returned result so callers (booking flows, webhooks) stay robust.
 */
export async function notifyUser(opts: NotifyOptions): Promise<NotifyResult> {
  const result: NotifyResult = {
    inApp: false,
    whatsapp: 'skipped',
    sms: 'skipped',
  };
  const supabase = await createClient();
  if (!supabase) return result;

  // 1. In-app row (not gated by prefs — the app's notification center is
  //    the system of record; prefs govern *external* interruptions).
  if (opts.inApp) {
    const { error } = await supabase.from('notifications').insert({
      user_id: opts.userId,
      type: opts.inApp.type,
      title_key: opts.inApp.titleKey,
      body_key: opts.inApp.bodyKey,
      body_args: opts.inApp.bodyArgs ?? {},
      link: opts.inApp.link ?? null,
    });
    result.inApp = !error;
    if (error) console.error('[notify] in-app insert failed', error.message);
  }

  // 2–3. External channels need the recipient's prefs + phone.
  const recipient = await loadRecipient(supabase, opts.userId);
  if (!recipient || !recipient.phone) return result;

  const prefKey = EVENT_PREF[opts.event];
  if (prefKey && !recipient.prefs[prefKey]) return result; // user opted out

  const channels = opts.channels ?? ['whatsapp', 'sms'];
  const waParams = {
    to: recipient.phone,
    locale: recipient.locale,
    name: recipient.name,
    listing: opts.params.listing ?? '',
    date: opts.params.date ?? '',
    time: opts.params.time ?? '',
    sender: opts.params.sender ?? '',
    offer: opts.params.offer ?? '',
    points: opts.params.points ?? '',
  };

  if (channels.includes('whatsapp')) {
    if (!isWhatsAppConfigured()) {
      result.whatsapp = 'not-configured';
    } else if (!recipient.whatsappOptIn) {
      result.whatsapp = 'skipped';
    } else {
      let r: { ok: boolean };
      switch (opts.event) {
        case 'booking_confirmed':
          r = await waBookingConfirmed(waParams);
          break;
        case 'booking_reminder':
          r = await waBookingReminder(waParams);
          break;
        case 'new_message':
          r = await waNewMessage(waParams);
          break;
        case 'offer_alert':
          r = await waOfferAlert(waParams);
          break;
        default:
          // Generic events fall back to SMS only — no WhatsApp template mapped.
          r = { ok: false };
          result.whatsapp = 'skipped';
          break;
      }
      if (result.whatsapp !== 'skipped') result.whatsapp = r.ok ? 'sent' : 'failed';
    }
  }

  if (channels.includes('sms')) {
    if (!isSmsConfigured()) {
      result.sms = 'not-configured';
    } else if (opts.event === 'verification_code') {
      const r = await sendVerificationCodeSms({
        to: recipient.phone,
        locale: recipient.locale,
        name: recipient.name,
        code: opts.params.code ?? '',
      });
      result.sms = r.ok ? 'sent' : 'failed';
    } else {
      // SMS carries the same short template as WhatsApp text.
      const { getTranslations } = await import('next-intl/server');
      const t = await getTranslations({
        locale: recipient.locale,
        namespace: 'Comms',
      });
      const key =
        opts.event === 'booking_request'
          ? 'bookingRequest'
          : opts.event === 'booking_cancelled'
            ? 'bookingCancelled'
            : opts.event === 'booking_completed'
              ? 'bookingCompleted'
              : opts.event === 'new_message'
                ? 'newMessage'
                : opts.event === 'offer_alert'
                  ? 'offerAlert'
                  : 'bookingConfirmed';
      const r = await sendSMS(
        recipient.phone,
        t(key, {
          name: recipient.name,
          listing: opts.params.listing ?? '',
          date: opts.params.date ?? '',
          sender: opts.params.sender ?? '',
          offer: opts.params.offer ?? '',
          points: opts.params.points ?? '',
        })
      );
      result.sms = r.ok ? 'sent' : 'failed';
    }
  }

  return result;
}
