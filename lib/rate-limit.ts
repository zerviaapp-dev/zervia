import { headers } from 'next/headers';

/**
 * Token-bucket rate limiter (per IP + action key).
 *
 * TWO BACKENDS, one interface:
 *
 * 1. Upstash Redis (production) — active when UPSTASH_REDIS_REST_URL and
 *    UPSTASH_REDIS_REST_TOKEN are set. Uses Upstash's REST API directly
 *    (no extra dependency) with an atomic Lua script: INCR + PEXPIRE on
 *    first hit. Works across all Vercel serverless instances.
 *
 * 2. In-memory Map (fallback) — used locally and when Upstash is not
 *    configured. Correct on a single instance; on Vercel serverless each
 *    instance keeps its own buckets, so limits are per-instance. Better
 *    than nothing, but configure Upstash before real traffic.
 *
 * Buckets expire lazily: entries not seen for 2× their window are pruned
 * on the next take(), so memory stays bounded without a sweeper.
 */
type Bucket = { tokens: number; lastRefill: number; windowMs: number };

const buckets = new Map<string, Bucket>();

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > bucket.windowMs * 2) {
      buckets.delete(key);
    }
  }
}

function takeMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  prune(now);

  const existing = buckets.get(key);
  if (!existing) {
    buckets.set(key, { tokens: limit - 1, lastRefill: now, windowMs });
    return true;
  }

  // Refill proportionally to elapsed time.
  const elapsed = now - existing.lastRefill;
  existing.tokens = Math.min(
    limit,
    existing.tokens + (elapsed / windowMs) * limit
  );
  existing.lastRefill = now;

  if (existing.tokens < 1) return false;
  existing.tokens -= 1;
  return true;
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/**
 * Distributed token bucket via Upstash REST EVAL (atomic).
 * Returns true when the action is allowed, false when rate-limited.
 * Falls back to the in-memory bucket when Upstash is unavailable or errors.
 */
async function takeUpstash(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const cfg = upstashConfig();
  if (!cfg) return takeMemory(key, limit, windowMs);

  // Atomic: increment; on first hit set the TTL. Returns the new count.
  const script = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    return current
  `;
  try {
    const res = await fetch(`${cfg.url}/eval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script,
        keys: [`ratelimit:${key}`],
        args: [String(windowMs)],
      }),
      // Don't let a slow Redis block the request path for long.
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const data = (await res.json()) as { result?: number };
    const count = Number(data.result ?? 0);
    return count <= limit;
  } catch (err) {
    // Redis down or unreachable — fail open to the local bucket rather
    // than taking the whole endpoint down. Log so it's visible.
    console.error('[rate-limit] upstash unavailable, using memory:', err);
    return takeMemory(key, limit, windowMs);
  }
}

/**
 * Attempt to consume one token (synchronous, in-memory only).
 * Fine for low-stakes local checks; prefer takeAsync()/rateLimit() for
 * anything that must hold across Vercel instances.
 */
export function take(key: string, limit: number, windowMs: number): boolean {
  return takeMemory(key, limit, windowMs);
}

/** Async token bucket: Upstash when configured, memory otherwise. */
export async function takeAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  return takeUpstash(key, limit, windowMs);
}

/** Best-effort client IP for server actions / route handlers. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/** Convenience: rate-limit the caller of a server action / API route. */
export async function rateLimit(
  action: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const ip = await clientIp();
  return takeAsync(`${action}:${ip}`, limit, windowMs);
}
