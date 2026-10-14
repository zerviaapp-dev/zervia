/**
 * SMS text alerts via Twilio.
 *
 * Setup (founder task, ~10 minutes):
 *   1. https://www.twilio.com/try-twilio → create account → get a phone number.
 *   2. Console dashboard → copy Account SID + Auth Token.
 *   3. Set TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE in Vercel env / .env.local.
 *
 * Used for: booking confirmations, verification codes, urgent alerts.
 * Longer marketing-style messages should prefer WhatsApp or push — SMS is
 * kept short (one segment ≈ 160 chars) to control cost.
 *
 * Every function is a graceful no-op when the env vars are missing, so
 * `next build` and the app never crash before the founder's setup.
 *
 * NOTE: this module uses `fetch` against the Twilio REST API directly so no
 * extra npm dependency is needed. Basic auth = base64(AccountSID:AuthToken).
 */

import { getTranslations } from 'next-intl/server';
import { defaultLocale } from './locales';

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_SID &&
      process.env.TWILIO_TOKEN &&
      process.env.TWILIO_PHONE
  );
}

export type SmsResult = { ok: true; sid?: string } | { ok: false; reason: string };

async function commsT(locale: string) {
  return getTranslations({ locale, namespace: 'Comms' });
}

/** Normalize to E.164 (+15551234567). Returns '' when unusable. */
export function normalizeE164(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return `+${digits}`;
}

/**
 * Low-level SMS send. `to` accepts any human-entered format; it is
 * normalized to E.164 first. Never throws — failures are returned.
 */
export async function sendSMS(to: string, body: string): Promise<SmsResult> {
  if (!isSmsConfigured()) return { ok: false, reason: 'not-configured' };
  const recipient = normalizeE164(to);
  if (!recipient) return { ok: false, reason: 'invalid-phone' };
  if (!body.trim()) return { ok: false, reason: 'empty-body' };

  try {
    const credentials = Buffer.from(
      `${process.env.TWILIO_SID}:${process.env.TWILIO_TOKEN}`
    ).toString('base64');
    const form = new URLSearchParams({
      To: recipient,
      From: process.env.TWILIO_PHONE!,
      Body: body.slice(0, 1000), // hard cap; Twilio segments beyond this get pricey
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error('[sms] send failed', res.status, errText.slice(0, 300));
      return { ok: false, reason: `http-${res.status}` };
    }
    const data = (await res.json()) as { sid?: string };
    return { ok: true, sid: data.sid };
  } catch (e) {
    console.error('[sms] send error', e);
    return { ok: false, reason: 'network-error' };
  }
}

export interface SmsParams {
  to: string;
  locale?: string;
  name: string;
  listing?: string;
  date?: string;
  code?: string;
}

/** Booking confirmation text — booking_updates pref. */
export async function sendBookingConfirmedSms(p: SmsParams): Promise<SmsResult> {
  const t = await commsT(p.locale || defaultLocale);
  return sendSMS(
    p.to,
    t('bookingConfirmed', {
      name: p.name,
      listing: p.listing ?? '',
      date: p.date ?? '',
    })
  );
}

/**
 * One-time verification code. TRANSACTIONAL — the dispatcher sends this
 * regardless of marketing preferences (but still requires a phone number).
 */
export async function sendVerificationCodeSms(p: SmsParams): Promise<SmsResult> {
  const t = await commsT(p.locale || defaultLocale);
  return sendSMS(p.to, t('verificationCode', { code: p.code ?? '' }));
}

/** Urgent booking alert (e.g. provider no-show, dispute update). */
export async function sendUrgentAlertSms(
  to: string,
  body: string
): Promise<SmsResult> {
  return sendSMS(to, body);
}
