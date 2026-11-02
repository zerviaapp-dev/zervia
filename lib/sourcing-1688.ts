/**
 * 1688.com guided manual-import flow.
 *
 * 1688 (Alibaba's domestic China wholesale marketplace) has no public,
 * foreigner-friendly API, so this module implements the practical path:
 * the provider pastes a 1688 product URL, we fetch the page server-side
 * and scrape the basics (title, price, images) from meta/OpenGraph/JSON-LD
 * tags, then pre-fill the product form. A small Chinese→English dictionary
 * helps with common product words; providers are always asked to verify
 * the translation before publishing.
 *
 * Server-side only (fetch + HTML parsing).
 */

import type { SourcedProduct } from './product-sourcing';

export interface Import1688Result {
  ok: boolean;
  product?: SourcedProduct;
  /** Machine-readable reason when ok === false (UI maps to i18n). */
  error?: 'invalid_url' | 'fetch_failed' | 'parse_failed';
}

/** Accept detail/offer/item pages on 1688.com (and m.1688.com). */
export function isValid1688Url(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return (
      (u.hostname === '1688.com' ||
        u.hostname.endsWith('.1688.com')) &&
      /\/(offer|detail|item)\//.test(u.pathname)
    );
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function metaContent(html: string, attr: string, value: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]*>`,
    'i'
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : null;
}

function allMetaImages(html: string): string[] {
  const out: string[] = [];
  const re = /<meta[^>]+property=["']og:image["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const content = m[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (content && /^https?:\/\//i.test(content) && !out.includes(content)) {
      out.push(content);
    }
  }
  return out.slice(0, 6);
}

/** Try JSON-LD Product blocks for name/price/image. */
function jsonLdProduct(html: string): Partial<SourcedProduct> {
  const out: Partial<SourcedProduct> = {};
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const blocks = Array.isArray(data) ? data : [data];
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        const type = String(b['@type'] ?? '');
        if (!/product/i.test(type)) continue;
        if (b.name && !out.name) out.name = decodeEntities(String(b.name));
        if (b.description && !out.description)
          out.description = decodeEntities(String(b.description)).slice(0, 500);
        const img = b.image;
        const imgs = Array.isArray(img) ? img : img ? [img] : [];
        const urls = imgs
          .map((i: unknown) =>
            typeof i === 'string' ? i : (i as Record<string, unknown> | null)?.url
          )
          .filter((u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u));
        if (urls.length && !out.images?.length) out.images = urls.slice(0, 6);
        const offers = b.offers;
        const price = Array.isArray(offers) ? offers[0]?.price : offers?.price;
        if (price && out.costCents == null) {
          const n = Number(price);
          if (Number.isFinite(n) && n > 0) out.costCents = Math.round(n * 100);
        }
        if (out.name) return out;
      }
    } catch {
      // Malformed JSON-LD — keep scanning other blocks.
    }
  }
  return out;
}

/** 1688 inline price hints like "¥12.50" or "￥12.5-18.0". */
function scrapePrice(html: string): number | null {
  const m = html.match(/(?:¥|￥|&yen;)\s?(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; // CNY cents
}

/**
 * Fetch a 1688 product page and extract title / price / images.
 * Never throws — returns { ok: false, error } on any failure.
 */
export async function fetch1688ProductInfo(
  rawUrl: string
): Promise<Import1688Result> {
  const url = rawUrl.trim();
  if (!isValid1688Url(url)) {
    return { ok: false, error: 'invalid_url' };
  }

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: 'fetch_failed' };
    html = await res.text();
  } catch {
    return { ok: false, error: 'fetch_failed' };
  }

  const ld = jsonLdProduct(html);
  const title =
    ld.name ||
    metaContent(html, 'property', 'og:title') ||
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  if (!title) return { ok: false, error: 'parse_failed' };

  const images = ld.images?.length
    ? ld.images
    : allMetaImages(html);

  const product: SourcedProduct = {
    supplierProductId: url,
    supplier: '1688',
    name: translateChineseTitle(decodeEntities(title)),
    originalName: decodeEntities(title),
    description: ld.description,
    costCents: ld.costCents ?? scrapePrice(html),
    images,
    sourceUrl: url,
  };
  return { ok: true, product };
}

// ---------------------------------------------------------------------------
// Chinese → English helper
// ---------------------------------------------------------------------------

/**
 * Common 1688 product words, Chinese → English. This is a rough aid for
 * skimming titles — the UI always tells providers to verify the translation.
 */
const ZH_EN: Array<[RegExp, string]> = [
  [/批发/g, 'wholesale'],
  [/厂家直销/g, 'factory direct'],
  [/厂家/g, 'factory'],
  [/直销/g, 'direct sale'],
  [/现货/g, 'in stock'],
  [/定制/g, 'custom'],
  [/定做/g, 'custom made'],
  [/包邮/g, 'free shipping'],
  [/新款/g, 'new style'],
  [/爆款/g, 'hot sale'],
  [/热卖/g, 'best seller'],
  [/服装/g, 'clothing'],
  [/女装/g, "women's clothing"],
  [/男装/g, "men's clothing"],
  [/童装/g, "kids' clothing"],
  [/鞋/g, 'shoes'],
  [/包/g, 'bag'],
  [/手机/g, 'phone'],
  [/手机壳/g, 'phone case'],
  [/耳机/g, 'earphones'],
  [/充电器/g, 'charger'],
  [/数据线/g, 'cable'],
  [/灯/g, 'lamp'],
  [/台灯/g, 'desk lamp'],
  [/玩具/g, 'toys'],
  [/厨房/g, 'kitchen'],
  [/家居/g, 'home'],
  [/家用/g, 'household'],
  [/户外/g, 'outdoor'],
  [/运动/g, 'sports'],
  [/美容/g, 'beauty'],
  [/化妆品/g, 'cosmetics'],
  [/饰品/g, 'jewelry'],
  [/项链/g, 'necklace'],
  [/手表/g, 'watch'],
  [/眼镜/g, 'glasses'],
  [/帽子/g, 'hat'],
  [/袜子/g, 'socks'],
  [/内衣/g, 'underwear'],
  [/连衣裙/g, 'dress'],
  [/衬衫/g, 'shirt'],
  [/裤子/g, 'pants'],
  [/外套/g, 'jacket'],
  [/羽绒服/g, 'down jacket'],
  [/毛衣/g, 'sweater'],
  [/塑料/g, 'plastic'],
  [/不锈钢/g, 'stainless steel'],
  [/玻璃/g, 'glass'],
  [/陶瓷/g, 'ceramic'],
  [/木/g, 'wood'],
  [/纸/g, 'paper'],
  [/布/g, 'fabric'],
  [/皮/g, 'leather'],
  [/金属/g, 'metal'],
  [/电子/g, 'electronic'],
  [/数码/g, 'digital'],
  [/智能/g, 'smart'],
  [/无线/g, 'wireless'],
  [/蓝牙/g, 'bluetooth'],
  [/充电/g, 'charging'],
  [/防水/g, 'waterproof'],
  [/便携/g, 'portable'],
  [/多功能/g, 'multi-function'],
  [/迷你/g, 'mini'],
  [/大号/g, 'large'],
  [/小号/g, 'small'],
  [/中号/g, 'medium'],
  [/红色/g, 'red'],
  [/黑色/g, 'black'],
  [/白色/g, 'white'],
  [/蓝色/g, 'blue'],
  [/绿色/g, 'green'],
  [/粉色/g, 'pink'],
  [/黄色/g, 'yellow'],
  [/紫色/g, 'purple'],
  [/灰色/g, 'gray'],
  [/跨境/g, 'cross-border'],
  [/外贸/g, 'foreign trade'],
  [/一件代发/g, 'dropshipping'],
  [/混批/g, 'mixed batch'],
  [/起订/g, 'MOQ'],
  [/价格/g, 'price'],
  [/促销/g, 'promotion'],
  [/特价/g, 'special price'],
  [/正品/g, 'genuine'],
  [/高品质/g, 'high quality'],
  [/工厂/g, 'factory'],
];

/**
 * Rough Chinese → English title translation using the dictionary above.
 * CJK characters that aren't in the dictionary are left in place.
 * ALWAYS verify before publishing — the UI says so explicitly.
 */
export function translateChineseTitle(title: string): string {
  let out = title;
  for (const [re, en] of ZH_EN) {
    out = out.replace(re, ` ${en} `);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** True when the text still contains CJK characters needing review. */
export function needsTranslationReview(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}
