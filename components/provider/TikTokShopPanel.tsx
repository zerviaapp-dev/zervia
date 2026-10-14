'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Panel } from '@/components/Panel';
import {
  pushProductToTikTokAction,
} from '@/lib/supabase/tiktok-actions';

/** Minimal product row the panel needs to render push buttons. */
export interface TikTokPanelProduct {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  stock: number;
}

// TODO (verify): official TikTok Shop Partner Center URL. This is the portal
// where the Zervia business account gets its app approved.
const TIKTOK_PARTNER_CENTER = 'https://partner.tiktokshop.com';

type PushState = 'idle' | 'pushing' | 'done' | 'error';

/**
 * Provider dashboard panel for the TikTok Shop integration.
 *
 * - Unconfigured: "coming soon" state with the approval instructions link.
 * - Configured: lists the provider's active products, each with a
 *   "Push to TikTok" button that calls the server action.
 *
 * All TikTok credentials stay server-side; the client only ever sees the
 * boolean status and translated result messages.
 */
export function TikTokShopPanel({
  configured,
  products,
}: {
  configured: boolean;
  products: TikTokPanelProduct[];
}) {
  const t = useTranslations('Provider');
  const locale = useLocale();
  const [pushState, setPushState] = useState<Record<string, PushState>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function handlePush(productId: string) {
    setPushState((s) => ({ ...s, [productId]: 'pushing' }));
    setNotice(null);
    try {
      const result = await pushProductToTikTokAction(productId, locale);
      setPushState((s) => ({ ...s, [productId]: result.ok ? 'done' : 'error' }));
      setNotice(result.message);
    } catch {
      setPushState((s) => ({ ...s, [productId]: 'error' }));
      setNotice(t('tiktokPushFailed'));
    }
  }

  const btn =
    'inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors';

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-900">
            🛍️ {t('tiktokTitle')}
          </h2>
          <p className="mt-1 text-sm text-brand-700">{t('tiktokSubtitle')}</p>
        </div>
        {configured ? (
          <span className="inline-flex min-h-[44px] items-center rounded-full bg-green-100 px-4 text-sm font-bold text-green-800">
            {t('tiktokConnected')}
          </span>
        ) : (
          <span className="inline-flex min-h-[44px] items-center rounded-full bg-amber-100 px-4 text-sm font-bold text-amber-800">
            {t('tiktokComingSoon')}
          </span>
        )}
      </div>

      {!configured ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-brand-700">{t('tiktokNotConfiguredText')}</p>
          <a
            href={TIKTOK_PARTNER_CENTER}
            target="_blank"
            rel="noreferrer"
            className={`${btn} border-2 border-brand-600 bg-white text-brand-700 hover:bg-brand-50`}
          >
            {t('tiktokDocsLink')} ↗
          </a>
        </div>
      ) : products.length === 0 ? (
        <p className="mt-4 text-sm text-brand-700">{t('tiktokNoProducts')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {products.map((p) => {
            const state = pushState[p.id] ?? 'idle';
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-brand-900">
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-xs text-brand-700">
                    {p.currency} {(p.price_cents / 100).toFixed(2)}
                    {p.stock >= 0 ? ` · ${p.stock}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={state === 'pushing' || state === 'done'}
                  onClick={() => handlePush(p.id)}
                  className={`${btn} ${
                    state === 'done'
                      ? 'bg-green-600 text-white'
                      : state === 'error'
                        ? 'border-2 border-red-300 bg-white text-red-700 hover:border-red-500'
                        : 'bg-brand-600 text-white hover:bg-brand-700'
                  } disabled:opacity-60`}
                >
                  {state === 'pushing'
                    ? t('tiktokPushing')
                    : state === 'done'
                      ? t('tiktokPushed')
                      : state === 'error'
                        ? t('tiktokPushFailedLabel')
                        : t('tiktokPush')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {notice && (
        <p role="status" className="mt-4 text-sm font-medium text-brand-800">
          {notice}
        </p>
      )}
    </Panel>
  );
}
