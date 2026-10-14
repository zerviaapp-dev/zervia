/**
 * CJ Dropshipping API client (server-side only).
 *
 * Docs: https://developers.cjdropshipping.com
 *
 * Auth flow: POST /authentication/getAccessToken with { apiKey } →
 * accessToken (expires in 30 days). We cache it in memory and refresh
 * on expiry. NEVER import this module in a client component — the API
 * key must never reach the browser.
 *
 * When CJ_API_KEY / CJ_API_SECRET are unset, every function degrades
 * gracefully (isCjConfigured() === false) and the app queues orders
 * for manual fulfillment instead of calling the API.
 */

const CJ_BASE_URL = 'https://developers.cjdropshipping.com/api2.0/v1';

export function isCjConfigured(): boolean {
  return Boolean(process.env.CJ_API_KEY);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!isCjConfigured()) return null;
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${CJ_BASE_URL}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    code?: number;
    data?: { accessToken?: string; accessTokenExpiryDate?: string };
  };
  const token = json?.data?.accessToken;
  if (!token) return null;
  // CJ tokens last ~30 days; refresh a day early to be safe.
  const expiry = json?.data?.accessTokenExpiryDate
    ? new Date(json.data.accessTokenExpiryDate).getTime()
    : now + 29 * 24 * 60 * 60 * 1000;
  cachedToken = { token, expiresAt: expiry - 24 * 60 * 60 * 1000 };
  return token;
}

async function cjFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(`${CJ_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': token,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { code?: number; data?: T; message?: string };
  if (json.code !== 200 && json.code !== undefined) {
    // Non-200 CJ business code — treat as soft failure.
    console.warn('[cj] api error', path, json.code, json.message);
    return null;
  }
  return (json.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CjProductSummary {
  pid: string;
  productName: string;
  productImage?: string;
  sellPrice?: number; // USD
  productWeight?: number;
  listedNum?: number;
}

export interface CjProductVariant {
  vid: string;
  variantName?: string;
  variantImage?: string;
  sellPrice?: number; // USD
  variantStock?: number;
}

export interface CjProductDetail extends CjProductSummary {
  description?: string;
  variants?: CjProductVariant[];
}

export interface CjOrderLine {
  vid: string;
  quantity: number;
}

export interface CjShippingAddress {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  province: string;
  zip: string;
  countryCode: string; // ISO-2
  phone: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** Search CJ's catalog. Returns null when unconfigured or on error. */
export async function searchCjProducts(
  keyword: string,
  page = 1,
  pageSize = 20
): Promise<{ list: CjProductSummary[]; total: number } | null> {
  if (!isCjConfigured() || !keyword.trim()) return null;
  return cjFetch<{ list: CjProductSummary[]; total: number }>(
    `/product/list?keyword=${encodeURIComponent(keyword.trim())}&pageNum=${page}&pageSize=${pageSize}`
  );
}

/** Full product detail including variants and pricing. */
export async function getCjProductDetail(pid: string): Promise<CjProductDetail | null> {
  if (!isCjConfigured() || !pid) return null;
  return cjFetch<CjProductDetail>(`/product/query?pid=${encodeURIComponent(pid)}`);
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Create a dropship order on CJ. Returns the CJ order id, or null when
 * unconfigured/failed — the caller should then queue for manual handling.
 */
export async function createCjOrder(
  lines: CjOrderLine[],
  address: CjShippingAddress,
  remark?: string
): Promise<string | null> {
  if (!isCjConfigured() || lines.length === 0) return null;
  const result = await cjFetch<{ orderId?: string; id?: string }>(
    '/shopping/order/createOrder',
    {
      method: 'POST',
      body: JSON.stringify({
        orderLines: lines,
        shippingAddress: {
          firstName: address.firstName,
          lastName: address.lastName,
          address: address.address,
          city: address.city,
          province: address.province,
          zip: address.zip,
          countryCode: address.countryCode,
          phone: address.phone,
          email: address.email ?? '',
        },
        remark: remark ?? 'Zervia order',
        logisticName: '', // let CJ pick the best/cheapest
      }),
    }
  );
  return result?.orderId ?? result?.id ?? null;
}

/** Tracking info for a CJ order id. */
export async function getCjTracking(orderId: string): Promise<{
  trackNumber?: string;
  status?: string;
} | null> {
  if (!isCjConfigured() || !orderId) return null;
  return cjFetch(`/logistic/track?orderId=${encodeURIComponent(orderId)}`);
}
