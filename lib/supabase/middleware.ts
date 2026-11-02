import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { fetchAgreementDecision } from './agreement-gate';
import type { AgreementGateDecision } from '@/lib/provider-agreement-gate';

/**
 * Middleware session refresh. Runs on every request: validates the session
 * cookie and attaches refreshed cookies to the outgoing response.
 * Returns `{ user, role }` so the middleware can gate protected routes.
 * Safe to call when Supabase isn't configured yet (returns user: null).
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { user: null, role: null as string | null };

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() revalidates the token with Supabase — never trust the
  // cookie payload alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Role lookup for the /app/admin/* gate. One indexed PK read per request.
  let role: string | null = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    role = data?.role ?? null;
  }

  return { user, role };
}

/**
 * Provider Agreement gate check for middleware: builds the same
 * session client as updateSession and reads the caller's provider row.
 * Returns the gate decision ('pass' when Supabase isn't configured, the
 * read fails, or there is nothing to enforce — see agreement-gate.ts
 * for the fail-open rule).
 */
export async function getProviderAgreementDecision(
  request: NextRequest,
  response: NextResponse,
  userId: string
): Promise<AgreementGateDecision> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return 'pass';

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  return fetchAgreementDecision(supabase, userId);
}
