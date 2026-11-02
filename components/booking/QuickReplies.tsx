'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  getQuickReplies,
  seedQuickReplies,
  DEFAULT_QUICK_REPLY_KEYS,
  type QuickReply,
} from '@/lib/quick-replies';

/**
 * Provider quick-reply chips above the chat input.
 * Tapping a chip inserts the template text into the draft.
 * Only rendered for providers (BookingChat gates on role).
 */
export function QuickReplies({
  onPick,
}: {
  onPick: (text: string) => void;
}) {
  const t = useTranslations('Bookings');
  const [replies, setReplies] = useState<QuickReply[]>([]);

  useEffect(() => {
    const defaults = DEFAULT_QUICK_REPLY_KEYS.map((k) => t(k));
    setReplies(seedQuickReplies(defaults));
    // Re-seed text is locale-dependent; re-run when locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  if (replies.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-500">
        ⚡ {t('quickRepliesLabel')}
      </p>
      <div className="flex flex-wrap gap-2">
        {replies.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.text)}
            title={r.text}
            className="inline-flex min-h-[44px] max-w-full items-center rounded-full border-2 border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:border-brand-400 hover:bg-brand-50"
          >
            <span className="truncate">
              {r.text.length > 42 ? `${r.text.slice(0, 42)}…` : r.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
