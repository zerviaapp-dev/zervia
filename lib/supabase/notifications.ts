/**
 * Server-side notification + points helpers.
 *
 * Migration 0036 revoked `notify_user` (and `award_points`) from the
 * `authenticated` role as an anti-phishing measure. Server actions therefore
 * cannot call these RPCs through the user's session client — the calls fail
 * with permission denied. These helpers route the RPCs through the
 * service-role client instead.
 *
 * CEO-approved Oct 11, 2026. The service-role client is used ONLY for these
 * specific RPC calls, never for general queries. See `admin.ts`.
 *
 * Server-only: never import from client components.
 */

import { createAdminClient } from './admin';

export type NotifyArgs = {
  userId: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  bodyArgs?: Record<string, string>;
  link?: string;
};

/**
 * Fire-and-forget in-app notification. Never throws — a notification
 * hiccup must not break the user-facing action. Failures are logged.
 */
export async function notifyUser(args: NotifyArgs): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) {
      console.warn(
        '[notifications] admin client unavailable — skipping notify_user'
      );
      return;
    }
    const { error } = await admin.rpc('notify_user', {
      p_user_id: args.userId,
      p_type: args.type,
      p_title_key: args.titleKey,
      p_body_key: args.bodyKey,
      p_body_args: args.bodyArgs ?? {},
      p_link: args.link ?? null,
    });
    if (error) {
      console.warn('[notifications] notify_user failed:', error.message);
    }
  } catch (err) {
    console.warn(
      '[notifications] notify_user threw:',
      err instanceof Error ? err.message : err
    );
  }
}

export type AwardPointsArgs = {
  userId: string;
  delta: number;
  reason: string;
  referenceId?: string | null;
};

/**
 * Award (or deduct) points via the service-role client. Returns the RPC
 * error, if any, so callers can distinguish idempotency signals
 * ("already awarded", "insufficient points") from real failures.
 */
export async function awardPointsAdmin(
  args: AwardPointsArgs
): Promise<{ error: { message: string } | null }> {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return { error: { message: 'admin client unavailable' } };
    }
    const { error } = await admin.rpc('award_points', {
      p_user_id: args.userId,
      p_delta: args.delta,
      p_reason: args.reason,
      p_reference_id: args.referenceId ?? null,
    });
    return { error: error ? { message: error.message } : null };
  } catch (err) {
    return {
      error: {
        message: err instanceof Error ? err.message : 'unknown error',
      },
    };
  }
}
