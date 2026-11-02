import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { getCeoProduct } from '@/lib/ceo-products';
import { assertCeo, getCeoReviews, type CeoStatus } from '@/lib/supabase/ceo-actions';
import { MarkdownPreview } from '@/components/ceo/MarkdownPreview';
import { CeoApprovalForm } from '@/components/ceo/CeoApprovalForm';

/**
 * CEO product preview — OWNER ONLY. Renders every document in the
 * product package, plus download + approval controls.
 */

const STATUS_LABEL: Record<CeoStatus, string> = {
  draft: '📝 Draft',
  ready: '🟡 Ready to review',
  approved: '✅ Approved',
  needs_revision: '🔄 Needs revision',
  rejected: '❌ Rejected',
};

export default async function CeoProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const supabase = await createClient();
  if (!supabase) return <NotConfigured />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(localizedPath('/login', locale));
  if (!(await assertCeo())) redirect(localizedPath('/app/dashboard', locale));

  const product = await getCeoProduct(slug);
  if (!product) redirect(localizedPath('/app/ceo/products', locale));

  const reviews = await getCeoReviews();
  const review = reviews[slug];
  const status: CeoStatus = review?.status ?? 'draft';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link
        href="/app/ceo/products"
        className="text-sm text-blue-600 font-medium"
      >
        ← Back to library
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{product.title}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs font-medium rounded-full bg-slate-100 text-slate-600 px-3 py-1">
            {STATUS_LABEL[status]}
          </span>
          {product.price && (
            <span className="text-xs font-medium rounded-full bg-blue-50 text-blue-700 px-3 py-1">
              {product.price}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {product.files.length} file{product.files.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <a
        href={`/api/ceo/products/${product.slug}/download`}
        className="block text-center rounded-full bg-slate-900 text-white font-semibold px-4 py-3"
      >
        ⬇ Download all files (ZIP)
      </a>

      <Panel className="p-5">
        <h2 className="font-bold text-slate-900 mb-3">CEO decision</h2>
        <CeoApprovalForm
          slug={product.slug}
          locale={locale}
          currentStatus={status}
          currentNotes={review?.notes ?? null}
        />
      </Panel>

      <div className="space-y-4">
        {product.documents.map((doc) => (
          <Panel key={doc.name} className="p-5">
            <h2 className="font-bold text-slate-900 mb-1">{doc.label}</h2>
            <p className="text-xs text-slate-400 mb-3">{doc.name}</p>
            <MarkdownPreview markdown={doc.markdown} />
          </Panel>
        ))}
      </div>
    </div>
  );
}
