import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Permitted callers (CEO-approved):
 * 1. The Stripe webhook handler: money writes must succeed regardless of any
 *    user's permissions, and the webhook has no user session at all.
 * 2. `lib/supabase/notifications.ts` ONLY: the `notify_user` and
 *    `award_points` RPCs (revoked from `authenticated` by migration 0036).
 *    The helper uses this client solely for those RPC calls — never for
 *    general queries.
 *
 * NEVER import this in pages, components, or other server actions directly.
 * Route through `notifications.ts` for notification/points RPCs.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
