import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { countryName } from '@/lib/countries';
import { approveProvider, rejectProvider } from '@/lib/supabase/provider-actions';

type PendingProvider = {
  id: string;
  business_name: string;
  category: string;
  description: string | null;
  country: string;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: string;
  id_document_path: string | null;
  created_at: string;
  profiles: { full_name: string; email: string } | null;
};

/**
 * Admin-only provider approval queue. Defence in depth:
 * middleware redirects non-admins away from /app/admin/* AND this page
 * re-checks the role server-side before rendering anything.
 */
export default async function AdminProvidersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Provider' });
  const tb = await getTranslations({ locale, namespace: 'Bookings' });
  const tc = await getTranslations({ locale, namespace: 'Categories' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizedPath('/login', locale));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    redirect(localizedPath('/app/dashboard', locale));
  }

  const { data } = (await supabase
    .from('providers')
    .select(
      'id, business_name, category, description, country, city, phone, whatsapp, status, id_document_path, created_at, profiles!inner(full_name, email)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })) as {
    data: PendingProvider[] | null;
  };
  const queue = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('adminTitle')}</h1>
      <p className="text-base text-brand-700">{t('adminSubtitle')}</p>

      <Link
        href="/app/admin/bookings"
        className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-base font-semibold text-brand-700 hover:bg-brand-50"
      >
        {tb('viewDisputes')}
      </Link>
      <Link
        href="/app/admin/verification"
        className="ml-3 inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-emerald-600 bg-white px-8 text-base font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        🛡️ {t('verificationQueueLabel')}
      </Link>

      {queue.length === 0 ? (
        <Panel>
          <p className="text-base text-brand-800">{t('adminQueueEmpty')}</p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {queue.map((p) => (
            <li key={p.id}>
              <Panel>
                <h2 className="text-xl font-bold text-brand-900">{p.business_name}</h2>
                <p className="mt-1 text-sm text-brand-700">
                  {tc(p.category as 'cleaning')} ·{' '}
                  {[p.city, countryName(p.country)].filter(Boolean).join(', ')}
                </p>
                {p.description ? (
                  <p className="mt-2 text-sm text-brand-800">{p.description}</p>
                ) : null}
                <p className="mt-2 text-sm text-brand-700">
                  {t('adminApplicant')}: {p.profiles?.full_name ?? ''} ({p.profiles?.email ?? ''})
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {p.id_document_path ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">
                      ✓ {t('idProvided')}
                    </span>
                  ) : (
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-700">
                      {t('idMissing')}
                    </span>
                  )}
                </p>
                {(p.phone || p.whatsapp) && (
                  <p className="mt-1 text-sm text-brand-700">
                    {p.phone ? `${t('phone')}: ${p.phone}` : ''}
                    {p.phone && p.whatsapp ? ' · ' : ''}
                    {p.whatsapp ? `WhatsApp: ${p.whatsapp}` : ''}
                  </p>
                )}
                <div className="mt-4 flex gap-3">
                  <form action={approveProvider} className="flex-1">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-green-600 px-8 text-lg font-semibold text-white hover:bg-green-700"
                    >
                      {t('approve')}
                    </button>
                  </form>
                  <form action={rejectProvider} className="flex-1">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full border-2 border-red-300 bg-white px-8 text-lg font-semibold text-red-700 hover:bg-red-50"
                    >
                      {t('reject')}
                    </button>
                  </form>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
