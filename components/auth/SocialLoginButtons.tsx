'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

import type { Provider } from '@supabase/auth-js';

// Supabase supports Instagram OAuth server-side (dashboard → Providers),
// but this installed auth-js version's `Provider` union predates it, so we
// carry the wider literal and cast at the call site. Safe: the string is
// passed straight through to Supabase's /authorize endpoint.
type SocialProvider = 'facebook' | 'instagram';

function FacebookGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46H15.2c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.9h-2.33V22c4.78-.76 8.43-4.92 8.43-9.94Z" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Social login buttons: Facebook + Instagram via Supabase OAuth.
 *
 * Redirects to `${window.location.origin}/auth/callback`, which exchanges
 * the returned `code` for a session (same route the email/magic-link flow
 * uses). If the provider isn't enabled in the Supabase dashboard,
 * signInWithOAuth returns an error — we surface a friendly message and
 * never redirect, so the email form stays usable.
 */
export function SocialLoginButtons() {
  const t = useTranslations('Auth');
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState('');

  async function handleClick(provider: SocialProvider) {
    setError('');
    setPending(provider);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: provider as Provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) {
        setError(t('socialLoginUnavailable'));
        setPending(null);
      }
      // On success the browser leaves for the provider; keep the spinner
      // up so it doesn't look broken during the redirect.
    } catch {
      setError(t('socialLoginError'));
      setPending(null);
    }
  }

  const busy = (p: SocialProvider) => pending === p;

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => handleClick('facebook')}
        disabled={pending !== null}
        aria-busy={busy('facebook')}
        className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full bg-[#1877F2] px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-[#1463cc] active:bg-[#0f50a8] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1877F2]"
      >
        <FacebookGlyph />
        {busy('facebook') ? '…' : t('continueWithFacebook')}
      </button>

      <button
        type="button"
        onClick={() => handleClick('instagram')}
        disabled={pending !== null}
        aria-busy={busy('instagram')}
        className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCB045] px-8 py-4 text-lg font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FD1D1D]"
      >
        <InstagramGlyph />
        {busy('instagram') ? '…' : t('continueWithInstagram')}
      </button>

      <div aria-hidden="true" className="flex items-center gap-4 pt-1">
        <span className="h-px flex-1 bg-brand-200" />
        <span className="text-sm font-medium text-brand-600">{t('socialDivider')}</span>
        <span className="h-px flex-1 bg-brand-200" />
      </div>
    </div>
  );
}
