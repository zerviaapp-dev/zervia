/**
 * CEO product library — server-only catalog reader.
 *
 * Product packages live in `content/products/` (copied from the
 * ~/workspace/zervia-listings workspace). Each folder is one product:
 * markdown files for curriculum, sales copy, pricing, and outlines.
 *
 * OWNER-ONLY: every consumer (pages, API routes, server actions) must
 * call `assertCeo()` from `./supabase/ceo-actions` before touching this.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** The Zervia owner account. CEO tools are visible to this email or admins. */
export const CEO_EMAIL = 'zerviaapp@gmail.com';

export type CeoProductType = 'ecourse' | 'ebook' | 'program' | 'service' | 'other';

export type CeoProductFile = {
  name: string;
  /** Pretty label, e.g. "Lesson 01" or "Sales Copy". */
  label: string;
  sizeBytes: number;
};

export type CeoProduct = {
  slug: string;
  title: string;
  type: CeoProductType;
  /** First $-price found in pricing.md, e.g. "$39". Null when none. */
  price: string | null;
  files: CeoProductFile[];
  /** Short excerpt from the first content file (for cards). */
  excerpt: string;
};

export type CeoProductDetail = CeoProduct & {
  documents: { name: string; label: string; markdown: string }[];
};

const PRODUCTS_DIR = path.join(process.cwd(), 'content', 'products');

function prettify(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function detectType(slug: string): CeoProductType {
  if (slug.endsWith('-course')) return 'ecourse';
  if (slug === 'ebooks') return 'ebook';
  if (slug.endsWith('-program')) return 'program';
  return 'other';
}

function fileLabel(name: string): string {
  const base = name.replace(/\.md$/, '');
  const lesson = base.match(/^lesson-(\d+)$/i);
  if (lesson) return `Lesson ${lesson[1]}`;
  return base
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Extract the first $ price mention, e.g. "$39" or "$23.99 CAD". */
function extractPrice(markdown: string): string | null {
  const m = markdown.match(/\$\s?[\d,]+(?:\.\d{1,2})?(?:\s?[A-Z]{3})?/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

/** First `# ` heading in the doc, else the prettified slug. */
function extractTitle(slug: string, docs: { markdown: string }[]): string {
  for (const d of docs) {
    const m = d.markdown.match(/^#\s+(.+)$/m);
    if (m) return m[1].replace(/\*\*/g, '').trim().slice(0, 80);
  }
  return prettify(slug);
}

/** First non-heading paragraph, trimmed. */
function extractExcerpt(docs: { markdown: string }[]): string {
  for (const d of docs) {
    const lines = d.markdown.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('|') || t.startsWith('---') || t.startsWith('!['))
        continue;
      return t.replace(/\*\*/g, '').replace(/[_*`]/g, '').slice(0, 160);
    }
  }
  return '';
}

async function readProductDir(slug: string): Promise<CeoProductDetail | null> {
  const dir = path.join(PRODUCTS_DIR, slug);
  let entries: string[];
  try {
    entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return null;
  }
  if (entries.length === 0) return null;

  const documents: CeoProductDetail['documents'] = [];
  for (const name of entries) {
    const markdown = await fs.readFile(path.join(dir, name), 'utf8');
    const stat = await fs.stat(path.join(dir, name));
    documents.push({ name, label: fileLabel(name), markdown });
    void stat;
  }

  // Prefer pricing.md first for price extraction, then everything else.
  const ordered = [
    ...documents.filter((d) => d.name === 'pricing.md'),
    ...documents.filter((d) => d.name !== 'pricing.md'),
  ];
  let price: string | null = null;
  for (const d of ordered) {
    price = extractPrice(d.markdown);
    if (price) break;
  }

  const files: CeoProductFile[] = await Promise.all(
    entries.map(async (name) => {
      const stat = await fs.stat(path.join(dir, name));
      return { name, label: fileLabel(name), sizeBytes: stat.size };
    })
  );

  return {
    slug,
    title: extractTitle(slug, ordered),
    type: detectType(slug),
    price,
    files,
    excerpt: extractExcerpt(ordered),
    documents,
  };
}

export async function listCeoProducts(): Promise<CeoProduct[]> {
  let slugs: string[];
  try {
    slugs = (await fs.readdir(PRODUCTS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const out: CeoProduct[] = [];
  for (const slug of slugs) {
    const detail = await readProductDir(slug);
    if (!detail) continue;
    const { documents, ...rest } = detail;
    void documents;
    out.push(rest);
  }
  return out;
}

export async function getCeoProduct(slug: string): Promise<CeoProductDetail | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return readProductDir(slug);
}

/** Raw file bytes for the download route. */
export async function getCeoProductFiles(
  slug: string
): Promise<{ name: string; content: Buffer }[] | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const dir = path.join(PRODUCTS_DIR, slug);
  let entries: string[];
  try {
    entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return null;
  }
  return Promise.all(
    entries.map(async (name) => ({
      name,
      content: await fs.readFile(path.join(dir, name)),
    }))
  );
}
