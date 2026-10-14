/**
 * TikTok Shop API client (server-side only).
 *
 * Docs: https://partner.tiktokshop.com/doc (TikTok Shop Partner Center)
 *
 * SCAFFOLD STATUS (Oct 9, 2026): TikTok Shop API access requires business
 * approval, which has not happened yet. Every public function below has its
 * real request structure in place, but while TIKTOK_APP_KEY /
 * TIKTOK_APP_SECRET / TIKTOK_SHOP_ID are unset they throw the typed
 * TikTokShopNotConfigured error instead of calling the network. Callers must
 * gate on isTikTokConfigured() and render a graceful "not connected / coming
 * soon" state — the app must never crash for lack of credentials.
 *
 * TODO (verify when the Zervia app is approved and keys exist):
 *  1. Confirm the signing algorithm below against the CURRENT TikTok Shop
 *     open API docs — TikTok revises endpoint versions and signing details.
 *  2. Confirm the product / order endpoint paths and versions used here
 *     (e.g. /product/202309 vs a newer version) and required fields.
 *  3. Currency mapping: TikTok Shop product prices must be expressed in the
 *     shop's region currency; wire that from the provider's shop settings.
 *  4. Implement the OAuth code exchange to obtain per-shop access tokens
 *     (TIKTOK_ACCESS_TOKEN placeholder below) instead of a static env token.
 *
 * NEVER import this module in a client component — the app secret and access
 * token must never reach the browser.
 */

import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TikTokShopConfig {
  appKey: string;
  appSecret: string;
  shopId: string;
  /** TODO: replace with per-shop OAuth tokens once the approval flow exists. */
  accessToken: string | null;
}

/**
 * Read the TikTok Shop config from the environment. Throws
 * TikTokShopNotConfigured when any required value is missing.
 */
export function getTikTokConfig(): TikTokShopConfig {
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const shopId = process.env.TIKTOK_SHOP_ID;
  if (!appKey || !appSecret || !shopId) {
    throw new TikTokShopNotConfigured();
  }
  return {
    appKey,
    appSecret,
    shopId,
    accessToken: process.env.TIKTOK_ACCESS_TOKEN ?? null,
  };
}

/**
 * Whether the minimum TikTok Shop credentials are present. Use this in
 * pages/panels to decide whether to render the connected UI or the
 * "coming soon / not connected" state.
 */
export function isTikTokConfigured(): boolean {
  return Boolean(
    process.env.TIKTOK_APP_KEY &&
      process.env.TIKTOK_APP_SECRET &&
      process.env.TIKTOK_SHOP_ID
  );
}

/** Thrown by every public function when TikTok Shop credentials are missing. */
export class TikTokShopNotConfigured extends Error {
  constructor() {
    super(
      'TikTok Shop is not configured: set TIKTOK_APP_KEY, TIKTOK_APP_SECRET and TIKTOK_SHOP_ID.'
    );
    this.name = 'TikTokShopNotConfigured';
  }
}

/** Thrown when TikTok Shop returns a business-level error. */
export class TikTokShopApiError extends Error {
  code: string | number | null;
  constructor(message: string, code: string | number | null = null) {
    super(message);
    this.name = 'TikTokShopApiError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal product payload a Zervia provider pushes to TikTok Shop. */
export interface TikTokProductInput {
  name: string;
  description: string;
  priceCents: number;
  imageUrls: string[];
  stock: number; // -1 = unlimited
}

/** Product record as returned by the TikTok Shop API. */
export interface TikTokProduct {
  id: string;
  name: string;
  status?: string;
  price?: string;
  currency?: string;
}

/** Order record as returned by the TikTok Shop API. */
export interface TikTokOrder {
  id: string;
  status: string;
  createTime?: number;
  totalAmount?: string;
  currency?: string;
}

// ---------------------------------------------------------------------------
// Request signing
// ---------------------------------------------------------------------------

// TODO: verify against the CURRENT TikTok Shop open API docs once the Zervia
// app is approved. The algorithm below follows the scheme documented for the
// TikTok Shop Partner Open API at scaffold time:
//
//   1. Collect all query parameters, EXCLUDING `sign` and `access_token`.
//   2. Sort parameter keys in ascending ASCII (alphabetical) order.
//   3. Concatenate each key directly followed by its value, with no
//      delimiters: "{key1}{value1}{key2}{value2}...".
//   4. Prepend the request path (e.g. "/product/202309/products").
//   5. For POST/PUT requests with a JSON body, append the exact stringified
//      JSON body after the sorted params.
//   6. Wrap the whole string with the app secret:
//        baseString = appSecret + path + sortedParams + requestBody + appSecret
//   7. sign = lowercase hex of HMAC-SHA256(key=appSecret, message=baseString).
//
// The request itself carries `app_key`, `timestamp` (unix seconds) and `sign`
// as query params; the access token goes in the `x-tts-access-token` header.
// Timestamp must be within ~5 minutes of TikTok's server time.
export function signRequest(opts: {
  appSecret: string;
  path: string;
  params: Record<string, string | number | null | undefined>;
  body?: unknown;
}): string {
  const pairs = Object.entries(opts.params)
    .filter(
      ([key, value]) =>
        key !== 'sign' &&
        key !== 'access_token' &&
        value !== null &&
        value !== undefined
    )
    .map(([key, value]) => [key, String(value)] as [string, string])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const sortedParams = pairs.map(([k, v]) => `${k}${v}`).join('');
  const bodyString = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const baseString = opts.appSecret + opts.path + sortedParams + bodyString + opts.appSecret;
  return createHmac('sha256', opts.appSecret)
    .update(baseString, 'utf8')
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

// TODO: confirm this base URL against current docs (sandbox uses a different
// host; note it here when sandbox testing starts).
const TIKTOK_API_BASE = 'https://open-api.tiktokglobalshop.com';

async function tiktokFetch<T>(
  path: string,
  init?: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    params?: Record<string, string | number>;
  }
): Promise<T> {
  const cfg = getTikTokConfig(); // throws TikTokShopNotConfigured
  const method = init?.method ?? 'GET';

  const params: Record<string, string | number> = {
    app_key: cfg.appKey,
    timestamp: Math.floor(Date.now() / 1000),
    ...(init?.params ?? {}),
  };
  params.sign = signRequest({
    appSecret: cfg.appSecret,
    path,
    params,
    body: init?.body,
  });

  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  );
  const res = await fetch(`${TIKTOK_API_BASE}${path}?${query.toString()}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      // TODO: confirm header name + token source (OAuth exchange) in current docs.
      ...(cfg.accessToken ? { 'x-tts-access-token': cfg.accessToken } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  let json: { code?: number; message?: string; data?: T };
  try {
    json = (await res.json()) as { code?: number; message?: string; data?: T };
  } catch {
    throw new TikTokShopApiError(`TikTok Shop returned non-JSON (HTTP ${res.status})`, res.status);
  }
  if (!res.ok || (json.code !== undefined && json.code !== 0)) {
    throw new TikTokShopApiError(
      json.message ?? `TikTok Shop request failed (HTTP ${res.status})`,
      json.code ?? res.status
    );
  }
  return (json.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * List products in the connected TikTok Shop.
 * Throws TikTokShopNotConfigured while credentials are missing.
 * TODO: confirm the search endpoint version and pagination shape in current docs.
 */
export async function listTikTokProducts(opts?: {
  pageSize?: number;
  pageToken?: string;
}): Promise<{ products: TikTokProduct[]; nextPageToken?: string }> {
  const cfg = getTikTokConfig(); // throws TikTokShopNotConfigured
  const data = await tiktokFetch<{
    products?: TikTokProduct[];
    next_page_token?: string;
  }>('/product/202312/products/search', {
    method: 'POST',
    params: { shop_id: cfg.shopId },
    body: {
      page_size: opts?.pageSize ?? 20,
      ...(opts?.pageToken ? { page_token: opts.pageToken } : {}),
    },
  });
  return {
    products: data.products ?? [],
    nextPageToken: data.next_page_token,
  };
}

/**
 * Push a Zervia product to TikTok Shop as a new product listing.
 * Returns the TikTok-side product id.
 * Throws TikTokShopNotConfigured while credentials are missing.
 *
 * TODO (verify in current docs when approved):
 *  - endpoint version and the exact create-product payload fields
 *    (category requirements, brand, image count/minimums, SKU structure);
 *  - price representation: this sends major-unit amount as a string plus the
 *    shop currency — confirm against the region the shop is registered in;
 *  - stock: TikTok wants per-SKU inventory; -1 (unlimited) currently maps to
 *    a large default quantity.
 */
export async function pushProductToTikTok(
  product: TikTokProductInput
): Promise<{ tiktokProductId: string }> {
  const cfg = getTikTokConfig(); // throws TikTokShopNotConfigured
  if (!product.name.trim() || product.priceCents <= 0) {
    throw new TikTokShopApiError('Cannot push product: name and a positive price are required.');
  }
  const data = await tiktokFetch<{ product_id?: string; id?: string }>(
    '/product/202309/products',
    {
      method: 'POST',
      params: { shop_id: cfg.shopId },
      body: {
        // Field names follow the documented create-product shape; TODO verify.
        title: product.name,
        description: product.description,
        price: {
          // TODO: confirm currency against the shop's registered region.
          currency: 'USD',
          amount: (product.priceCents / 100).toFixed(2),
        },
        images: product.imageUrls.map((url) => ({ uri: url })),
        skus: [
          {
            inventory: [
              {
                // -1 (Zervia "unlimited") → large default; TODO refine.
                quantity: product.stock < 0 ? 9999 : product.stock,
              },
            ],
          },
        ],
      },
    }
  );
  const tiktokProductId = data.product_id ?? data.id;
  if (!tiktokProductId) {
    throw new TikTokShopApiError('TikTok Shop did not return a product id.');
  }
  return { tiktokProductId };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Fetch the current status of a TikTok Shop order.
 * Throws TikTokShopNotConfigured while credentials are missing.
 * TODO: confirm the order-detail endpoint version in current docs.
 */
export async function getOrderStatus(orderId: string): Promise<TikTokOrder> {
  const cfg = getTikTokConfig(); // throws TikTokShopNotConfigured
  if (!orderId) {
    throw new TikTokShopApiError('orderId is required.');
  }
  const data = await tiktokFetch<{
    order_id?: string;
    id?: string;
    order_status?: string;
    status?: string;
    create_time?: number;
    payment?: { total_amount?: string; currency?: string };
  }>(`/order/202309/orders/${encodeURIComponent(orderId)}`, {
    params: { shop_id: cfg.shopId },
  });
  return {
    id: data.order_id ?? data.id ?? orderId,
    status: data.order_status ?? data.status ?? 'unknown',
    createTime: data.create_time,
    totalAmount: data.payment?.total_amount,
    currency: data.payment?.currency,
  };
}
