'use client';

import { useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { sendMessage, markMessagesSeen } from '@/lib/supabase/message-actions';
import { Panel } from '@/components/Panel';

export type ChatMessage = {
  id: string;
  body: string;
  sender_id: string;
  seen_at: string | null;
  created_at: string;
};

const initialState = { ok: true, message: '' };

/**
 * Booking-bound chat thread. Messages arrive via Supabase Realtime with a
 * 15s polling fallback (realtime can drop on flaky mobile networks).
 * Read receipts: opening the thread (and each new arrival) marks the
 * other party's messages as seen.
 */
export function BookingChat({
  bookingId,
  initialMessages,
  currentUserId,
  counterpartyName,
}: {
  bookingId: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
  counterpartyName: string;
}) {
  const t = useTranslations('Bookings');
  const locale = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [state, formAction, pending] = useActionState(sendMessage, initialState);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const savedDraft = useRef('');
  const lastState = useRef(state);

  // If a send fails, restore the draft so no text is lost.
  useEffect(() => {
    if (state !== lastState.current) {
      lastState.current = state;
      if (!state.ok && state.message && savedDraft.current) {
        setDraft(savedDraft.current);
        savedDraft.current = '';
      }
    }
  }, [state]);

  // Mark the thread seen on open.
  useEffect(() => {
    const fd = new FormData();
    fd.append('locale', locale);
    fd.append('bookingId', bookingId);
    markMessagesSeen(fd).catch(() => {});
  }, [bookingId, locale]);

  // Scroll to latest on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  // Realtime subscription + polling fallback.
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`booking-chat-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row]
          );
          // Their new message → mark seen right away while we're here.
          if (row.sender_id !== currentUserId) {
            const fd = new FormData();
            fd.append('locale', locale);
            fd.append('bookingId', bookingId);
            markMessagesSeen(fd).catch(() => {});
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? row : m))
          );
        }
      )
      .subscribe();

    // Polling fallback every 15s in case realtime drops.
    const poll = window.setInterval(async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, body, sender_id, seen_at, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      if (data) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const fresh = (data as ChatMessage[]).filter((m) => !ids.has(m.id));
          if (fresh.length === 0) {
            // Merge seen_at updates too.
            const byId = new Map((data as ChatMessage[]).map((m) => [m.id, m]));
            return prev.map((m) => byId.get(m.id) ?? m);
          }
          return [...prev, ...fresh];
        });
      }
    }, 15000);

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [bookingId, currentUserId, locale]);

  const lastOwnSeen = [...messages]
    .reverse()
    .find((m) => m.sender_id === currentUserId && m.seen_at);

  return (
    <Panel>
      <h2 className="text-xl font-bold text-brand-900">
        {t('chatTitle', { name: counterpartyName })}
      </h2>

      <div
        className="mt-3 flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-2xl bg-brand-50 p-3"
        role="log"
        aria-live="polite"
        aria-label={t('chatTitle', { name: counterpartyName })}
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-base text-brand-500">
            {t('chatEmpty')}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-base ${
                    mine
                      ? 'rounded-br-md bg-brand-600 text-white'
                      : 'rounded-bl-md bg-white text-brand-900 shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`mt-1 text-xs ${
                      mine ? 'text-brand-100' : 'text-brand-400'
                    }`}
                  >
                    {new Date(m.created_at).toLocaleString(locale, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {lastOwnSeen ? (
        <p className="mt-1 text-right text-xs font-medium text-brand-500">
          ✓✓ {t('chatSeen')}
        </p>
      ) : null}

      <form action={formAction} className="mt-3 flex gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="bookingId" value={bookingId} />
        <label htmlFor="chat-body" className="sr-only">
          {t('chatPlaceholder')}
        </label>
        <input
          id="chat-body"
          name="body"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('chatPlaceholder')}
          maxLength={2000}
          autoComplete="off"
          className="min-h-[56px] flex-1 rounded-full border-2 border-brand-200 bg-white px-5 text-base text-brand-900 placeholder:text-brand-300 focus:border-brand-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          onClick={() => {
            // Optimistic clear (restored by effect if the send fails).
            if (draft.trim().length > 0) {
              savedDraft.current = draft;
              setDraft('');
            }
          }}
          className="inline-flex min-h-[56px] min-w-[56px] items-center justify-center rounded-full bg-brand-600 px-6 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          aria-label={t('chatSend')}
        >
          {pending ? '…' : '↑'}
        </button>
      </form>
      {!state.ok && state.message ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-600">
          {state.message}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-brand-500">{t('chatSafetyNote')}</p>
    </Panel>
  );
}
