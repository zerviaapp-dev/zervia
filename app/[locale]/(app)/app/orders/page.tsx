import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { getMyProductOrders } from '@/lib/supabase/product-actions';

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
 * Buyer's product orders: status, tracking number, totals.
 * Tracking appears once CJ ships (or the provider enters it manually).
 */
export default async function MyOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { locale } = await params;
  const { checkout } = await searchParams;
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

  const orders = await getMyProductOrders();

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('myOrders')}</h1>

      {checkout === 'success' && (
        <Panel className="border-green-300 bg-green-50">
          <p className="text-green-800">{t('orderSuccess')}</p>
        </Panel>
      )}

      {orders.length === 0 ? (
        <Panel>
          <p className="text-center text-brand-700">{t('noOrders')}</p>
          <div className="mt-4 text-center">
            <Link
              href={localizedPath('/discover', locale)}
              className="rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
            >
              {t('browseProducts')}
            </Link>
          </div>
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
    </div>
  );
}
