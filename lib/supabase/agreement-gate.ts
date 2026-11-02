import {
  agreementGateDecision,
  type AgreementGateDecision,
} from '@/lib/provider-agreement-gate';

/**
 * Load the signed-in user's provider row and decide whether the
 * Provider Agreement re-acceptance gate applies.
 *
 * Fail-open on infrastructure problems ONLY: if the agreement_version
 * read errors (e.g. migration 0035 not applied in some environment),
 * the decision is 'pass' — the gate must never lock every provider out
 * because of a missing column. Enforcement happens on a successful read
 * whose recorded version is stale (including null).
 *
 * `supabase` is the request-scoped server client (lib/supabase/server
 * or the middleware client); RLS scopes the row to the caller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAgreementDecision(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<AgreementGateDecision> {
  if (!supabase) return 'pass';
  const { data, error } = await supabase
    .from('providers')
    .select('agreement_version')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return 'pass';
  if (!data) return 'onboarding';
  return agreementGateDecision(
    (data as { agreement_version?: string | null }).agreement_version ?? null,
    true
  );
}
