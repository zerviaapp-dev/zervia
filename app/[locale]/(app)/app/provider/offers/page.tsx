import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { CreateOfferForm } from '@/components/offers/CreateOfferForm';
import { OfferStatusToggle } from '@/components/offers/OfferStatusToggle';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { getMyProviderOffers } from '@/lib/supabase/offer-actions';

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Provider offer management: create offers, pause/resume them, and see
 * redemptions + marketing fees owed. Server-rendered; mutations via
 * server actions; ownership enforced by RLS + server-side checks.
 */
export default async function ProviderOffersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Offers' });
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

  const stats = await getMyProviderOffers();
  if (!stats) {
    redirect(localizedPath('/app/become-provider', locale));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">🎁 {t('myOffers')}</h1>
        <p className="mt-1 text-base text-brand-700">{t('subtitle')}</p>
      </div>

      {/* Fees owed */}
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-700">{t('feesOwed')}</p>
            <p className="text-3xl font-bold text-brand-600">
              {money(stats.feesOwedCents)}
            </p>
            <p className="mt-1 text-xs text-brand-600">{t('feesOwedHint')}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-brand-700">
              {t('redemptionsCount', { count: stats.totalRedemptions })}
            </p>
          </div>
        </div>
      </Panel>

      {/* Create */}
      <Panel>
        <h2 className="mb-4 text-xl font-bold text-brand-900">{t('createOffer')}</h2>
        <CreateOfferForm locale={locale} />
      </Panel>

      {/* Existing offers */}
      <div>
        <h2 className="mb-3 text-xl font-bold text-brand-900">{t('myOffers')}</h2>
        {stats.offers.length === 0 ? (
          <Panel>
            <p className="text-sm text-brand-700">{t('noOffers')}</p>
          </Panel>
        ) : (
          <ul className="space-y-3">
            {stats.offers.map((o) => (
              <li key={o.id}>
                <Panel className="!p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-bold text-brand-900">{o.title}</p>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            o.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {o.status === 'active' ? t('active') : t('paused')}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-brand-600">
                        {o.reward_points} pts
                        {o.min_spend_cents > 0
                          ? ` · ${t('minSpendLabel', { amount: money(o.min_spend_cents) })}`
                          : ''}
                        {' · '}
                        {t('redemptionsCount', { count: o.redemption_count })}
                        {o.max_redemptions ? ` / ${o.max_redemptions}` : ''}
                      </p>
                    </div>
                    <OfferStatusToggle
                      offerId={o.id}
                      currentStatus={o.status}
                      locale={locale}
                    />
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
