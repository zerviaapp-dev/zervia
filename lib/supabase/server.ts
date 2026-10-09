import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Whether the Supabase project credentials are present.
 * The app renders a friendly "not connected yet" state when false,
 * so `next build` and the UI never crash before the founder's 10-minute setup.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Server-side Supabase client (Server Components, Server Actions, routes).
 * Returns null when unconfigured — callers render the setup notice instead.
 * Auth logic lives here / in actions.ts, never in client components.
 */
export async function createClient() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component (not an Action/Route):
            // cookie writes aren't allowed there. The middleware
            // refreshes the session on every request instead.
          }
        },
      },
    }
  );
}
