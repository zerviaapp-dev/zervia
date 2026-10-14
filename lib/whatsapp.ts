/**
 * WhatsApp notifications via the Meta WhatsApp Business Cloud API.
 *
 * Setup (founder task, ~15 minutes):
 *   1. https://developers.facebook.com → create an app → add "WhatsApp"
 *   2. Copy the test phone number's Phone number ID and a temporary token
 *      (or a permanent system-user token for production).
 *   3. Set WHATSAPP_TOKEN + WHATSAPP_PHONE_ID in Vercel env / .env.local.
 *
 * IMPORTANT — message templates: WhatsApp only allows free-form *text*
 * messages inside an open 24-hour customer-service window. Proactive
 * notifications (booking reminders, offer alerts) sent outside that window
 * MUST use a pre-approved message template. Create templates in the
 * WhatsApp Manager (e.g. `zervia_booking_confirmed`) and either:
 *   a) set WHATSAPP_USE_TEMPLATES=true and map events to template names
 *      below, or
 *   b) keep the default text mode and accept that out-of-window sends
 *      may be rejected by Meta (the error is logged, never thrown).
 *
 * Every function is a graceful no-op when the env vars are missing, so
 * `next build` and the app never crash before the founder's setup.
 */

import { getTranslations } from 'next-intl/server';
import { defaultLocale } from './locales';

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID
  );
}

export type WhatsAppResult = { ok: true } | { ok: false; reason: string };

async function commsT(locale: string) {
  return getTranslations({ locale, namespace: 'Comms' });
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  // WhatsApp Cloud API expects E.164 without the leading '+'.
  return digits;
}

async function postToGraph(payload: Record<string, unknown>): Promise<WhatsAppResult> {
  if (!isWhatsAppConfigured()) return { ok: false, reason: 'not-configured' };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error('[whatsapp] send failed', res.status, errText.slice(0, 300));
      return { ok: false, reason: `http-${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[whatsapp] send error', e);
    return { ok: false, reason: 'network-error' };
  }
}

/**
 * Free-form text message. Works inside an open 24h customer-service
 * window; Meta may reject it outside the window (see module docstring).
 */
export async function sendWhatsAppText(
  to: string,
  body: string
): Promise<WhatsAppResult> {
  const recipient = normalizePhone(to);
  if (!recipient) return { ok: false, reason: 'invalid-phone' };
  return postToGraph({ to: recipient, type: 'text', text: { body } });
}

/**
 * Template message for proactive notifications outside the 24h window.
 * `templateName` must be an APPROVED template in WhatsApp Manager;
 * `bodyParams` fill the template's {{1}}, {{2}}, … placeholders in order.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  bodyParams: string[],
  languageCode = 'en_US'
): Promise<WhatsAppResult> {
  const recipient = normalizePhone(to);
  if (!recipient) return { ok: false, reason: 'invalid-phone' };
  return postToGraph({
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: bodyParams.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  });
}

/** Event → approved template name mapping. Override via env if needed. */
const TEMPLATE_NAMES: Record<string, string> = {
  booking_confirmed: process.env.WHATSAPP_TPL_BOOKING_CONFIRMED || 'zervia_booking_confirmed',
  booking_reminder: process.env.WHATSAPP_TPL_BOOKING_REMINDER || 'zervia_booking_reminder',
  new_message: process.env.WHATSAPP_TPL_NEW_MESSAGE || 'zervia_new_message',
  offer_alert: process.env.WHATSAPP_TPL_OFFER_ALERT || 'zervia_offer_alert',
};

function shouldUseTemplates(): boolean {
  return process.env.WHATSAPP_USE_TEMPLATES === 'true';
}

export interface WhatsAppParams {
  to: string;
  locale?: string;
  name: string;
  listing?: string;
  date?: string;
  time?: string;
  sender?: string;
  offer?: string;
  points?: string;
}

async function sendLocalized(
  event: keyof typeof TEMPLATE_NAMES,
  p: WhatsAppParams,
  templateKey: string,
  templateParams: string[],
  values: Record<string, string>
): Promise<WhatsAppResult> {
  const locale = p.locale || defaultLocale;
  if (shouldUseTemplates()) {
    return sendWhatsAppTemplate(p.to, TEMPLATE_NAMES[event], templateParams);
  }
  const t = await commsT(locale);
  return sendWhatsAppText(p.to, t(templateKey, values));
}

/** "Your booking is confirmed" — booking_updates pref. */
export function sendBookingConfirmed(p: WhatsAppParams): Promise<WhatsAppResult> {
  return sendLocalized(
    'booking_confirmed',
    p,
    'bookingConfirmed',
    [p.name, p.listing ?? '', p.date ?? ''],
    { name: p.name, listing: p.listing ?? '', date: p.date ?? '' }
  );
}

/** "Your booking is tomorrow" — booking_updates pref. */
export function sendBookingReminder(p: WhatsAppParams): Promise<WhatsAppResult> {
  return sendLocalized(
    'booking_reminder',
    p,
    'bookingReminder',
    [p.name, p.listing ?? '', p.time ?? ''],
    { name: p.name, listing: p.listing ?? '', time: p.time ?? '' }
  );
}

/** "You have a new message" — new_messages pref. */
export function sendNewMessage(p: WhatsAppParams): Promise<WhatsAppResult> {
  return sendLocalized(
    'new_message',
    p,
    'newMessage',
    [p.name, p.sender ?? '', p.listing ?? ''],
    { name: p.name, sender: p.sender ?? '', listing: p.listing ?? '' }
  );
}

/** "New offer available" — offer_alerts pref. */
export function sendOfferAlert(p: WhatsAppParams): Promise<WhatsAppResult> {
  return sendLocalized(
    'offer_alert',
    p,
    'offerAlert',
    [p.name, p.offer ?? '', p.points ?? ''],
    { name: p.name, offer: p.offer ?? '', points: p.points ?? '' }
  );
}
