'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

import type { Provider } from '@supabase/auth-js';

// Social providers, in Liz's chosen order: Google first, Yahoo second.
// - 'google' is a native Supabase Auth provider: enable it in the Supabase
//   dashboard → Authentication → Providers → Google, with the Google Cloud
//   OAuth client ID + secret. Authorized redirect URI on the Google side:
//   https://<supabase-project-ref>.supabase.co/auth/v1/callback
// - 'custom:yahoo' is a CUSTOM OIDC provider (the `custom:` prefix is part of
//   this auth-js version's Provider union — no cast needed). Register it in
//   the Supabase dashboard → Authentication → Providers → Add a custom OIDC
//   provider with identifier `custom:yahoo`:
//     discovery URL : https://api.login.yahoo.com/.well-known/openid-configuration
//     scopes        : openid profile email
//     redirect URI  : https://<supabase-project-ref>.supabase.co/auth/v1/callback
//   (same callback URL as Google). Client ID + secret come from the Yahoo
//   Developer app (developer.yahoo.com/apps/create).
type SocialProvider = 'google' | 'custom:yahoo';

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.42-3.42A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

function YahooGlyph() {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 items-center justify-center text-lg font-black leading-none"
    >
      Y!
    </span>
  );
}

/**
 * Social login buttons: Google + Yahoo via Supabase OAuth.
 *
 * Redirects to `${window.location.origin}/auth/callback`, which exchanges
 * the returned `code` for a session (same route the email flow uses). If a
 * provider isn't configured in the Supabase dashboard, signInWithOAuth
 * returns an error — we surface a friendly message and never redirect, so
 * the email form stays usable.
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
          scopes: provider === 'custom:yahoo' ? 'openid profile email' : undefined,
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
        onClick={() => handleClick('google')}
        disabled={pending !== null}
        aria-busy={busy('google')}
        className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-8 py-4 text-lg font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4285F4]"
      >
        <GoogleGlyph />
        {busy('google') ? '…' : t('continueWithGoogle')}
      </button>

      <button
        type="button"
        onClick={() => handleClick('custom:yahoo')}
        disabled={pending !== null}
        aria-busy={busy('custom:yahoo')}
        className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full bg-[#6001D2] px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-[#4d01a8] active:bg-[#3d0186] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6001D2]"
      >
        <YahooGlyph />
        {busy('custom:yahoo') ? '…' : t('continueWithYahoo')}
      </button>

      <div aria-hidden="true" className="flex items-center gap-4 pt-1">
        <span className="h-px flex-1 bg-brand-200" />
        <span className="text-sm font-medium text-brand-600">{t('socialDivider')}</span>
        <span className="h-px flex-1 bg-brand-200" />
      </div>
    </div>
  );
}
