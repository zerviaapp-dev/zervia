'use client';

import Script from 'next/script';

/**
 * Cloudflare Turnstile — renders the real widget when a site key is
 * configured, otherwise a clearly-labelled stub box. Tokens are verified
 * server-side by lib/turnstile.ts (verifyTurnstile); production fails
 * closed when the secret key is missing.
 */
export function Turnstile({ note }: { note: string }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return (
      <div
        aria-hidden="true"
        className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm text-brand-700"
      >
        {note}
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div className="cf-turnstile flex justify-center" data-sitekey={siteKey} />
    </>
  );
}
