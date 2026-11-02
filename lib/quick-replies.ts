/**
 * Provider quick-reply templates ("auto-replies").
 *
 * Stored in localStorage per device — no database migration needed.
 * Each template is a short canned response the provider can tap to
 * insert into the booking chat. Providers manage them in
 * /app/provider/quick-replies; BookingChat renders them as chips.
 */

export type QuickReply = {
  id: string;
  text: string;
};

const STORAGE_KEY = 'zervia-quick-replies-v1';

/** Built-in starter templates (i18n keys in the Bookings namespace). */
export const DEFAULT_QUICK_REPLY_KEYS = [
  'quickReplyAvailability',
  'quickReplyIncluded',
  'quickReplyPricing',
] as const;

function makeId(): string {
  return `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** All saved templates; empty array when none (caller seeds defaults). */
export function getQuickReplies(): QuickReply[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is QuickReply =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as QuickReply).id === 'string' &&
        typeof (r as QuickReply).text === 'string' &&
        (r as QuickReply).text.trim().length > 0
    );
  } catch {
    return [];
  }
}

/**
 * Seed the store with translated defaults. Returns the full list.
 * Call with the current locale's translated default texts.
 */
export function seedQuickReplies(defaultTexts: string[]): QuickReply[] {
  const existing = getQuickReplies();
  if (existing.length > 0) return existing;
  const seeded: QuickReply[] = defaultTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ id: makeId(), text }));
  saveQuickReplies(seeded);
  return seeded;
}

export function saveQuickReplies(replies: QuickReply[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(replies));
  } catch {
    // Storage full or unavailable — templates just won't persist.
  }
}

export function addQuickReply(text: string): QuickReply[] {
  const replies = getQuickReplies();
  const next = [...replies, { id: makeId(), text: text.trim() }];
  saveQuickReplies(next);
  return next;
}

export function updateQuickReply(id: string, text: string): QuickReply[] {
  const next = getQuickReplies().map((r) =>
    r.id === id ? { ...r, text: text.trim() } : r
  );
  saveQuickReplies(next);
  return next;
}

export function deleteQuickReply(id: string): QuickReply[] {
  const next = getQuickReplies().filter((r) => r.id !== id);
  saveQuickReplies(next);
  return next;
}
