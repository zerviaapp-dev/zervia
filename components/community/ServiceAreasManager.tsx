'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type Area = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  verified_at: string;
};

/**
 * GPS service-area verification for Community providers (§7a).
 * "Verify" captures the device's current GPS fix — the provider must
 * be physically in the area — and records it via the API (max 2).
 * Strings are passed in by the server page (Provider namespace +
 * Community namespace) to keep this component translation-agnostic.
 */
export function ServiceAreasManager({
  labels,
}: {
  labels: {
    title: string;
    note: string;
    labelPlaceholder: string;
    verifyCta: string;
    removeCta: string;
    locating: string;
    geoError: string;
    maxNote: string;
    empty: string;
  };
}) {
  const t = useTranslations('Community');
  const [areas, setAreas] = useState<Area[]>([]);
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'idle' | 'locating' | 'saving' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/provider/service-areas');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) setAreas(data.areas ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function verify() {
    if (!label.trim()) {
      setStatus('error');
      setMessage(labels.labelPlaceholder);
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('error');
      setMessage(labels.geoError);
      return;
    }
    setStatus('locating');
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setStatus('saving');
        try {
          const res = await fetch('/api/provider/service-areas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: label.trim(),
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            setLabel('');
            setStatus('idle');
            await load();
          } else {
            setStatus('error');
            setMessage(data.message || 'Error');
          }
        } catch {
          setStatus('error');
          setMessage('Error');
        }
      },
      () => {
        setStatus('error');
        setMessage(labels.geoError);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  async function remove(id: string) {
    try {
      await fetch('/api/provider/service-areas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await load();
    } catch {
      /* non-fatal */
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-brand-700">{labels.note}</p>
      <p className="text-sm font-semibold text-brand-800">{t('locationNote')}</p>
      {areas.length === 0 ? (
        <p className="text-sm text-brand-600">{labels.empty}</p>
      ) : (
        <ul className="space-y-2">
          {areas.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-2xl border-2 border-brand-100 bg-white px-4 py-3"
            >
              <span className="text-base font-semibold text-brand-900">
                📍 {a.label}{' '}
                <span className="text-xs font-medium text-brand-500">
                  {new Date(a.verified_at).toLocaleDateString()}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(a.id)}
                className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brand-200 px-4 text-sm font-semibold text-brand-700"
              >
                {labels.removeCta}
              </button>
            </li>
          ))}
        </ul>
      )}
      {areas.length < 2 ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={labels.labelPlaceholder}
            maxLength={120}
            className="min-h-[52px] flex-1 rounded-2xl border-2 border-brand-100 bg-white px-4 py-2 text-base text-brand-900"
          />
          <button
            type="button"
            onClick={verify}
            disabled={status === 'locating' || status === 'saving'}
            className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {status === 'locating' ? labels.locating : labels.verifyCta}
          </button>
        </div>
      ) : (
        <p className="text-sm font-semibold text-brand-700">{labels.maxNote}</p>
      )}
      {status === 'error' && message ? (
        <p role="alert" className="text-sm font-medium text-red-700">{message}</p>
      ) : null}
    </div>
  );
}
