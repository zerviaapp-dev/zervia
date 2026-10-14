/**
 * AliExpress Open Platform product-sourcing client (scaffold).
 *
 * Providers can search the AliExpress catalog and import products into
 * their Zervia shop. When ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET are
 * set, this calls the real AliExpress Open Platform API
 * (aliexpress.affiliate.product.query / aliexpress.ds.product.get style
 * endpoints). When unset, searchAliExpressProducts returns curated demo
 * results clearly marked as samples so the UI stays usable in development.
 *
 * Docs: https://developers.aliexpress.com (API access requires an approved
 * AliExpress developer account — a founder task, not code).
 */

import { createHmac } from 'crypto';
import type { SourcedProduct } from './product-sourcing';

export interface AliExpressSearchOptions {
  query: string;
  /** 1-based page. */
  page?: number;
  /** Results per page (max 50). */
  pageSize?: number;
  /** ISO currency for prices, e.g. 'USD'. */
  currency?: string;
  /** BCP 47 language for titles, e.g. 'en'. */
  language?: string;
}

export interface AliExpressSearchResult {
  products: SourcedProduct[];
  total: number;
  /** True when results are local samples (API keys not configured). */
  isSample: boolean;
}

export function isAliExpressConfigured(): boolean {
  return Boolean(
    process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET
  );
}

/**
 * Build the signed request for the AliExpress Open Platform.
 * AliExpress uses MD5/HMAC signing over sorted params; this helper keeps
 * the signing logic in one place for when keys are provisioned.
 */
function signParams(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('md5', secret).update(sorted, 'utf8').digest('hex').toUpperCase();
}

const API_GATEWAY = 'https://api-sg.aliexpress.com/sync';

/**
 * Real API call path (only used when keys are configured).
 * Wraps aliexpress.affiliate.product.query and normalizes to SourcedProduct.
 */
async function queryAliExpressApi(
  opts: AliExpressSearchOptions
): Promise<AliExpressSearchResult> {
  const appKey = process.env.ALIEXPRESS_APP_KEY!;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET!;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));

  const params: Record<string, string> = {
    method: 'aliexpress.affiliate.product.query',
    app_key: appKey,
    sign_method: 'md5',
    timestamp: String(Date.now()),
    format: 'json',
    v: '2.0',
    keywords: opts.query,
    page_no: String(page),
    page_size: String(pageSize),
    target_currency: opts.currency ?? 'USD',
    target_language: opts.language ?? 'EN',
    sort: 'SALE_PRICE_ASC',
  };
  params.sign = signParams(params, appSecret);

  const res = await fetch(API_GATEWAY, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`AliExpress API error: ${res.status}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const body = (json?.aliexpress_affiliate_product_query_response as Record<string, unknown> | undefined)?.resp_result as Record<string, unknown> | undefined;
  if (!body || body.resp_code !== 200) {
    throw new Error(
      `AliExpress API returned ${body?.resp_code ?? 'unknown'}: ${body?.resp_msg ?? 'no message'}`
    );
  }
  const result = body?.result as Record<string, unknown> | undefined;
  const productsNode = result?.products as Record<string, unknown> | undefined;
  const items = (productsNode?.product ?? []) as Record<string, unknown>[];
  const products: SourcedProduct[] = items.map((p: Record<string, unknown>) => ({
    supplierProductId: String(p.product_id ?? p.productId ?? ''),
    supplier: 'aliexpress' as const,
    name: String(p.product_title ?? p.productTitle ?? ''),
    originalName: undefined,
    description: undefined,
    costCents: p.target_sale_price
      ? Math.round(Number(p.target_sale_price) * 100)
      : null,
    images: p.product_main_image_url
      ? [String(p.product_main_image_url)]
      : [],
    sourceUrl: p.product_detail_url
      ? String(p.product_detail_url)
      : undefined,
  }));
  return {
    products,
    total: Number(result?.total_record_count ?? products.length),
    isSample: false,
  };
}

/** Clearly-marked sample results for development / unconfigured installs. */
function sampleResults(query: string): SourcedProduct[] {
  const q = query.trim() || 'gadget';
  return [
    {
      supplierProductId: 'sample-ae-1',
      supplier: 'aliexpress',
      name: `Sample: ${q} — bestseller style pick`,
      description:
        'Sample result. Connect AliExpress API keys to search the live catalog.',
      costCents: 1299,
      images: [],
      sourceUrl: undefined,
    },
    {
      supplierProductId: 'sample-ae-2',
      supplier: 'aliexpress',
      name: `Sample: ${q} — budget alternative`,
      description:
        'Sample result. Connect AliExpress API keys to search the live catalog.',
      costCents: 749,
      images: [],
      sourceUrl: undefined,
    },
  ];
}

/**
 * Search AliExpress for products. Server-side only (uses secret keys).
 * Never throws for missing config — returns sample results instead.
 */
export async function searchAliExpressProducts(
  opts: AliExpressSearchOptions
): Promise<AliExpressSearchResult> {
  const query = opts.query.trim();
  if (!query) return { products: [], total: 0, isSample: false };

  if (!isAliExpressConfigured()) {
    return { products: sampleResults(query), total: 2, isSample: true };
  }

  try {
    return await queryAliExpressApi(opts);
  } catch (err) {
    // Fail soft: surface the error to the caller via empty + sample flag off,
    // so the UI can show a proper error message instead of crashing.
    console.error('[aliexpress] search failed:', err);
    throw err;
  }
}
