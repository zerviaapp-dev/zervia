import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { listCeoProducts, type CeoProduct, type CeoProductType } from '@/lib/ceo-products';
import { assertCeo, getCeoReviews, type CeoStatus } from '@/lib/supabase/ceo-actions';

/**
 * CEO product library — OWNER ONLY (owner email or admin role).
 * Lists every product package with preview + download + approval status.
 * English-only UI: this is an internal founder tool, not customer-facing.
 */

const TYPE_META: Record<CeoProductType, { emoji: string; label: string }> = {
  ecourse: { emoji: '🎓', label: 'Ecourse' },
  ebook: { emoji: '📕', label: 'Ebook' },
  program: { emoji: '🏋️', label: 'Program' },
  service: { emoji: '💆', label: 'Service' },
  other: { emoji: '📦', label: 'Other' },
};

const STATUS_META: Record<CeoStatus, { emoji: string; label: string; classes: string }> = {
  draft: { emoji: '📝', label: 'Draft', classes: 'bg-slate-100 text-slate-600' },
  ready: { emoji: '🟡', label: 'Ready to review', classes: 'bg-amber-100 text-amber-800' },
  approved: { emoji: '✅', label: 'Approved', classes: 'bg-green-100 text-green-800' },
  needs_revision: { emoji: '🔄', label: 'Needs revision', classes: 'bg-orange-100 text-orange-800' },
  rejected: { emoji: '❌', label: 'Rejected', classes: 'bg-red-100 text-red-800' },
};

function ProductCard({ product, status }: { product: CeoProduct; status: CeoStatus }) {
  const tm = TYPE_META[product.type];
  const sm = STATUS_META[status];
  return (
    <Panel className="p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium rounded-full bg-blue-50 text-blue-700 px-2 py-0.5">
          {tm.emoji} {tm.label}
        </span>
        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${sm.classes}`}>
          {sm.emoji} {sm.label}
        </span>
      </div>
      <h3 className="font-semibold text-slate-900 leading-snug">{product.title}</h3>
      {product.excerpt && <p className="text-sm text-slate-500 line-clamp-2">{product.excerpt}</p>}
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="text-sm font-semibold text-slate-700">{product.price ?? '—'}</span>
        <span className="text-xs text-slate-400">
          {product.files.length} file{product.files.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex gap-2 pt-1">
        <Link
          href={`/app/ceo/products/${product.slug}`}
          className="flex-1 text-center rounded-full bg-blue-600 text-white text-sm font-semibold px-3 py-2"
        >
          Preview
        </Link>
        <a
          href={`/api/ceo/products/${product.slug}/download`}
          className="flex-1 text-center rounded-full bg-slate-100 text-slate-700 text-sm font-semibold px-3 py-2"
        >
          ⬇ Download
        </a>
      </div>
    </Panel>
  );
}

export default async function CeoProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  if (!supabase) return <NotConfigured />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(localizedPath('/login', locale));
  if (!(await assertCeo())) redirect(localizedPath('/app/dashboard', locale));

  const [products, reviews] = await Promise.all([listCeoProducts(), getCeoReviews()]);

  const counts: Record<CeoStatus, number> = { draft: 0, ready: 0, approved: 0, needs_revision: 0, rejected: 0 };
  for (const p of products) counts[reviews[p.slug]?.status ?? 'draft']++;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">👑 CEO Product Library</h1>
        <p className="text-sm text-slate-500 mt-1">
          Preview, download, and approve every Zervia product before it goes live. Owner-only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_META) as CeoStatus[]).map((s) => (
          <span key={s} className={`text-xs font-medium rounded-full px-3 py-1 ${STATUS_META[s].classes}`}>
            {STATUS_META[s].emoji} {STATUS_META[s].label}: {counts[s]}
          </span>
        ))}
        <span className="text-xs font-medium rounded-full px-3 py-1 bg-blue-600 text-white">
          Total: {products.length}
        </span>
      </div>

      {products.length === 0 ? (
        <Panel className="p-8 text-center text-slate-500">
          No product packages found. Add folders under <code>content/products/</code>.
        </Panel>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <ProductCard key={p.slug} product={p} status={reviews[p.slug]?.status ?? 'draft'} />
          ))}
        </div>
      )}
    </div>
  );
}
