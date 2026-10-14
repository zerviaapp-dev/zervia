import Stripe from 'stripe';
import { getStripe, isStripeConfigured } from './stripe';

export type IdentityStatus = 'unverified' | 'pending' | 'verified' | 'failed';

/**
 * In-memory session registry keyed by Zervia user id.
 *
 * PRODUCTION PATH: migration 0031_identity_verification.sql adds
 * `profiles.identity_session_id` / `profiles.identity_status`. Once that
 * migration is applied, replace this Map with reads/writes against those
 * columns so session ids survive process restarts and scale past a single
 * instance. The session's `zervia_user_id` metadata is the durable link —
 * the webhook uses it, not this map.
 */
const sessionByUser = new Map<string, string>();

export type CreateIdentitySessionResult =
  | { ok: true; sessionId: string; url: string }
  | { ok: false; error: string };

/**
 * Server-side only — NEVER import from client code.
 *
 * Creates a Stripe Identity VerificationSession (hosted document check)
 * for the given user. Returns the hosted URL the provider must be
 * redirected to. Fails gracefully when Stripe is unconfigured.
 */
export async function createIdentityVerificationSession(
  userId: string,
  returnUrl: string
): Promise<CreateIdentitySessionResult> {
  if (!isStripeConfigured()) {
    console.log('[identity] Stripe not configured — identity verification unavailable');
    return { ok: false, error: 'identity_not_configured' };
  }
  try {
    const session = await getStripe().identity.verificationSessions.create({
      type: 'document',
      return_url: returnUrl,
      metadata: { zervia_user_id: userId },
    });
    sessionByUser.set(userId, session.id);
    if (!session.url) {
      console.error('[identity] session created without a hosted URL', session.id);
      return { ok: false, error: 'identity_url_missing' };
    }
    return { ok: true, sessionId: session.id, url: session.url };
  } catch (err) {
    console.error('[identity] create session failed', err);
    return { ok: false, error: 'identity_create_failed' };
  }
}

/**
 * Server-side only — NEVER import from client code.
 *
 * Maps the latest Stripe session status onto Zervia's four states:
 *   verified  → 'verified'
 *   processing → 'pending'
 *   requires_input → 'pending' while the user hasn't started; 'failed'
 *                    when Stripe reports a verification error (retryable)
 *   canceled / others → 'failed'
 * No session (or Stripe unconfigured) → 'unverified'.
 */
export async function getIdentityStatus(userId: string): Promise<IdentityStatus> {
  if (!isStripeConfigured()) {
    console.log('[identity] Stripe not configured — returning unverified');
    return 'unverified';
  }
  const sessionId = sessionByUser.get(userId);
  if (!sessionId) return 'unverified';
  try {
    const session: Stripe.Identity.VerificationSession =
      await getStripe().identity.verificationSessions.retrieve(sessionId);
    switch (session.status) {
      case 'verified':
        return 'verified';
      case 'processing':
        return 'pending';
      case 'requires_input':
        return session.last_error ? 'failed' : 'pending';
      case 'canceled':
        return 'failed';
      default:
        return 'pending';
    }
  } catch (err) {
    console.error('[identity] status lookup failed', err);
    return 'unverified';
  }
}

/**
 * Server-side only. Records a session id seen outside this process
 * (e.g. from the webhook) so getIdentityStatus can find it.
 */
export function rememberIdentitySession(userId: string, sessionId: string): void {
  sessionByUser.set(userId, sessionId);
}
