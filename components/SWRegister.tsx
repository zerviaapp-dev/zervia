'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker (public/sw.js). Registration is
 * best-effort: failures (private mode, unsupported browsers) are
 * silently ignored — the app works fine without it.
 */
export function SWRegister() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is a bonus, not a requirement.
      });
    }
  }, []);

  return null;
}
