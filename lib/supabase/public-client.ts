import { createServerClient } from '@supabase/ssr';

/**
 * Cookie-free Supabase client for PUBLIC data only (added Oct 23, 2026 —
 * Fast Origin Transfer fix).
 *
 * The regular server client (`lib/supabase/server.ts`) calls `cookies()`
 * from `next/headers`, which opts every page that touches it into dynamic
 * rendering: no Vercel edge cache, a full origin render on every visit,
 * and the response marked `private, no-store`. On the Hobby plan that
 * burned the team's entire 10 GB Fast Origin Transfer allowance.
 *
 * This client never reads request cookies, so pages/components using it
 * stay static/ISR-cacheable. It authenticates as the anonymous role —
 * only use it for data that RLS already exposes to anonymous visitors
 * (e.g. active listings). NEVER use it for per-user data.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}
