import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { LoadOfferButton } from '@/components/offers/LoadOfferButton';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import {
  getActiveOffers,
  getMyActivations,
} from '@/lib/supabase/offer-actions';

function dollars(points: number): string {
  return `$${(points / 100).toFixed(points % 100 === 0 ? 0 : 2)}`;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Customer Offers shelf (RBC-style): browse provider offers, "Load" them,
 * and earn the points automatically when a qualifying booking completes.
 * Auth-gated; server-rendered; mutations via server actions.
 */
export default async function OffersPage({
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

  const [offers, activations] = await Promise.all([
    getActiveOffers(),
    getMyActivations(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">🎁 {t('title')}</h1>
        <p className="mt-1 text-base text-brand-700">{t('subtitle')}</p>
      </div>

      {/* Available offers */}
      <div>
        <h2 className="mb-3 text-xl font-bold text-brand-900">
          {t('availableOffers')}
        </h2>
        {offers.length === 0 ? (
          <Panel>
            <p className="text-base font-semibold text-brand-900">{t('noOffers')}</p>
            <p className="mt-1 text-sm text-brand-700">{t('noOffersHint')}</p>
          </Panel>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {offers.map((o) => (
              <li key={o.id}>
                <Panel className="flex h-full flex-col">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                    {o.business_name}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-brand-900">{o.title}</h3>
                  {o.description ? (
                    <p className="mt-1 text-sm text-brand-700">{o.description}</p>
                  ) : null}
                  <p className="mt-2 text-2xl font-bold text-brand-600">
                    {o.reward_points} pts{' '}
                    <span className="text-base font-semibold text-brand-500">
                      {t('pointsApprox', { dollars: dollars(o.reward_points) })}
                    </span>
                  </p>
                  {o.min_spend_cents > 0 ? (
                    <p className="mt-1 text-sm text-brand-700">
                      {t('minSpendLabel', { amount: money(o.min_spend_cents) })}
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <LoadOfferButton
                      offerId={o.id}
                      locale={locale}
                      alreadyLoaded={!!o.loaded}
                    />
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* My loaded offers */}
      <div>
        <h2 className="mb-3 text-xl font-bold text-brand-900">
          {t('myLoadedOffers')}
        </h2>
        {activations.length === 0 ? (
          <Panel>
            <p className="text-sm text-brand-700">{t('noLoaded')}</p>
          </Panel>
        ) : (
          <ul className="space-y-3">
            {activations.map((a) => (
              <li key={a.id}>
                <Panel className="!p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-brand-900">
                        {a.offer?.title ?? '—'}
                      </p>
                      <p className="text-sm text-brand-600">
                        {a.offer?.business_name} · {a.offer?.reward_points} pts
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        a.redeemed_at
                          ? 'bg-brand-100 text-brand-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {a.redeemed_at ? t('redeemed') : t('loaded')}
                    </span>
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
