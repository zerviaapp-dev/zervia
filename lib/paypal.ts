/**
 * PayPal REST API client (server-side only — the secret must never
 * reach the browser).
 *
 * Used for one-time purchases (featured boost, verification badge,
 * featured week, profile spotlight) via the Orders v2 API, and for
 * provider memberships via the Subscriptions API.
 *
 * Sandbox vs production is controlled by PAYPAL_MODE=sandbox|live
 * (default sandbox). All credentials come from env — never from
 * request bodies.
 */

const SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const LIVE_BASE = 'https://api-m.paypal.com';

export function isPayPalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}

export function paypalMode(): 'sandbox' | 'live' {
  return process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox';
}

function baseUrl(): string {
  return paypalMode() === 'live' ? LIVE_BASE : SANDBOX_BASE;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * OAuth2 client-credentials access token, cached until ~1 minute
 * before expiry. Throws when PayPal is not configured.
 */
export async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error('PayPal is not configured: PAYPAL_CLIENT_ID / PAYPAL_SECRET missing.');
  }
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PayPal token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

export type PayPalApiError = Error & { status?: number };

/**
 * Authenticated PayPal REST call. Returns the parsed JSON body.
 * Throws on non-2xx with the status attached.
 */
export async function paypalApi<T>(
  path: string,
  opts: { method?: string; body?: unknown; requestId?: string } = {}
): Promise<T> {
  const token = await getPayPalAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (opts.requestId) headers['PayPal-Request-Id'] = opts.requestId;
  const res = await fetch(`${baseUrl()}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: T;
  try {
    data = (text ? JSON.parse(text) : {}) as T;
  } catch {
    data = {} as T;
  }
  if (!res.ok) {
    const err = new Error(
      `PayPal API ${opts.method ?? 'GET'} ${path} failed (${res.status}): ${text.slice(0, 300)}`
    ) as PayPalApiError;
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Cents → PayPal decimal string, e.g. 900 → "9.00". */
export function centsToPayPalValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type PayPalOrder = {
  id: string;
  status: string;
  links?: { href: string; rel: string; method?: string }[];
};

export type PayPalCapture = {
  id: string;
  status: string;
  purchase_units?: {
    payments?: {
      captures?: { id: string; status: string; amount?: { currency_code: string; value: string } }[];
    };
  }[];
};

export type PayPalSubscription = {
  id: string;
  status: string;
  links?: { href: string; rel: string; method?: string }[];
};

/**
 * Verify a PayPal webhook event signature via PayPal's
 * verify-webhook-signature endpoint. Returns true only when PayPal
 * confirms the event is authentic.
 */
export async function verifyPayPalWebhook(
  headers: Record<string, string | null>,
  webhookEvent: unknown
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  try {
    const result = await paypalApi<{ verification_status: string }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: {
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: webhookId,
          webhook_event: webhookEvent,
        },
      }
    );
    return result.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}

/**
 * PayPal plan ID for a membership tier × interval, from env. Plans are
 * created once in the PayPal dashboard (Subscriptions → Plans); the
 * founder pastes the IDs here. Returns null when not configured.
 */
export function paypalPlanId(
  tier: 'pro' | 'business',
  interval: 'month' | 'year'
): string | null {
  const key =
    `PAYPAL_PLAN_${tier.toUpperCase()}_${interval.toUpperCase()}` as const;
  return process.env[key] ?? null;
}
