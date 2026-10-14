'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Panel } from '@/components/Panel';
import {
  getQuickReplies,
  seedQuickReplies,
  addQuickReply,
  updateQuickReply,
  deleteQuickReply,
  DEFAULT_QUICK_REPLY_KEYS,
  type QuickReply,
} from '@/lib/quick-replies';

/**
 * Provider settings: create, edit, and delete quick-reply templates.
 * Templates are stored per device (localStorage) and appear as one-tap
 * chips in the booking chat for the provider.
 */
export function QuickReplyManager() {
  const t = useTranslations('Provider');
  const tb = useTranslations('Bookings');
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    const defaults = DEFAULT_QUICK_REPLY_KEYS.map((k) => tb(k));
    setReplies(seedQuickReplies(defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tb]);

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    setReplies(addQuickReply(text));
    setNewText('');
  };

  const startEdit = (r: QuickReply) => {
    setEditingId(r.id);
    setEditText(r.text);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editText.trim()) return;
    setReplies(updateQuickReply(editingId, editText));
    setEditingId(null);
    setEditText('');
  };

  const handleDelete = (id: string) => {
    setReplies(deleteQuickReply(id));
    if (editingId === id) {
      setEditingId(null);
      setEditText('');
    }
  };

  return (
    <div className="space-y-5">
      <Panel>
        <h2 className="text-lg font-bold text-brand-900">{t('qrAddTitle')}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="qr-new" className="sr-only">
            {t('qrPlaceholder')}
          </label>
          <textarea
            id="qr-new"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={t('qrPlaceholder')}
            maxLength={500}
            rows={2}
            className="auth-input min-h-[56px] flex-1 rounded-2xl px-4 py-3 text-base"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={newText.trim().length === 0}
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-6 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {t('qrAdd')}
          </button>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-lg font-bold text-brand-900">
          {t('qrListTitle', { count: replies.length })}
        </h2>
        {replies.length === 0 ? (
          <p className="mt-2 text-base text-brand-700">{t('qrEmpty')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {replies.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4"
              >
                {editingId === r.id ? (
                  <div className="space-y-2">
                    <label htmlFor={`qr-edit-${r.id}`} className="sr-only">
                      {t('qrPlaceholder')}
                    </label>
                    <textarea
                      id={`qr-edit-${r.id}`}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      maxLength={500}
                      rows={2}
                      className="auth-input min-h-[56px] w-full rounded-2xl px-4 py-3 text-base"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={editText.trim().length === 0}
                        className="inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {t('qrSave')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brand-200 px-5 text-sm font-semibold text-brand-700 hover:border-brand-400"
                      >
                        {t('qrCancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-base text-brand-900">
                      {r.text}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brand-200 px-4 text-sm font-semibold text-brand-700 hover:border-brand-400"
                      >
                        {t('qrEdit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="inline-flex min-h-[44px] items-center rounded-full border-2 border-red-200 px-4 text-sm font-semibold text-red-700 hover:border-red-400"
                        aria-label={t('qrDelete')}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-brand-500">{t('qrNote')}</p>
      </Panel>
    </div>
  );
}
