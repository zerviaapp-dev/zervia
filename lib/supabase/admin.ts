import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — bypasses RLS. For the Stripe webhook
 * handler ONLY: money writes must succeed regardless of any user's
 * permissions, and the webhook has no user session at all.
 *
 * NEVER import this in pages, components, or server actions that run
 * with a user context. The webhook route is the single permitted caller.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
