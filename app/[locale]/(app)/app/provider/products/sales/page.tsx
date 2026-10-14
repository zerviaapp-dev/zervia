import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { getProviderProductOrders } from '@/lib/supabase/product-actions';

const STATUS_KEYS: Record<string, string> = {
  pending_payment: 'statusPendingPayment',
  paid: 'statusPaid',
  pending_fulfillment: 'statusPendingFulfillment',
  fulfilling: 'statusFulfilling',
  shipped: 'statusShipped',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
};

/**
 * Provider product sales: every order for their shop products with
 * fulfillment status. Orders with `fulfillment_queued` need manual
 * handling (CJ API keys not configured) — the provider ships them
 * themselves and the platform still takes its 10%/5% fee.
 */
export default async function ProductSalesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Products' });
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

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!provider) {
    redirect(localizedPath('/app/provider', locale));
  }

  const orders = await getProviderProductOrders();

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('salesTitle')}</h1>

      {orders.length === 0 ? (
        <Panel>
          <p className="text-center text-brand-700">{t('noSales')}</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Panel key={o.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-brand-900">
                  {(o.total_cents / 100).toFixed(2)} {o.currency.toUpperCase()} · ×
                  {o.quantity}
                </p>
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800">
                  {t(STATUS_KEYS[o.status] ?? 'statusPendingPayment')}
                </span>
              </div>
              {o.fulfillment_queued && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  ⚠️ {t('fulfillmentQueued')}
                </p>
              )}
              {o.cj_tracking_number && (
                <p className="text-sm text-brand-700">
                  {t('trackingNumber')}:{' '}
                  <span className="font-mono font-semibold">{o.cj_tracking_number}</span>
                </p>
              )}
              <p className="text-xs text-brand-500">
                {new Date(o.created_at).toLocaleDateString()}
              </p>
            </Panel>
          ))}
        </div>
      )}

      <Link
        href={localizedPath('/app/provider/products', locale)}
        className="text-sm font-semibold text-brand-600 hover:underline"
      >
        ← {t('title')}
      </Link>
    </div>
  );
}
