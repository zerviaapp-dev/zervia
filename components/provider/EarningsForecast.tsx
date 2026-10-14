import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import {
  currencyForCountry,
  formatCurrency,
} from '@/lib/currency';

type MonthBooking = {
  status: string;
  listings: { price_cents: number | null } | null;
};

/**
 * Provider earnings forecast widget: "You're on track for $X this month!"
 *
 * Math (simple, honest):
 * - earned = sum of completed bookings' listing prices this month
 * - pipeline = sum of pending + confirmed bookings' listing prices
 * - forecast = earned + pipeline ("on track for")
 * Bookings without a listing price are counted but add $0.
 */
export async function EarningsForecast({
  providerId,
  country,
  locale,
}: {
  providerId: string;
  country: string;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Provider' });
  const supabase = await createClient();
  const currency = currencyForCountry(country);

  if (!supabase) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const { data } = (await supabase
    .from('bookings')
    .select('status, listings(price_cents)')
    .eq('provider_id', providerId)
    .gte('created_at', monthStart)
    .lt('created_at', monthEnd)) as { data: MonthBooking[] | null };

  const bookings = data ?? [];
  const priceOf = (b: MonthBooking) => b.listings?.price_cents ?? 0;

  const earned = bookings
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + priceOf(b), 0);
  const pipeline = bookings
    .filter((b) => b.status === 'pending' || b.status === 'confirmed')
    .reduce((sum, b) => sum + priceOf(b), 0);
  const completedCount = bookings.filter((b) => b.status === 'completed').length;
  const activeCount = bookings.filter(
    (b) => b.status === 'pending' || b.status === 'confirmed'
  ).length;

  const forecast = earned + pipeline;
  const fmt = (cents: number) => formatCurrency(cents, currency, locale);

  // Progress bar: earned vs forecast (avoid divide-by-zero).
  const progressPct =
    forecast > 0 ? Math.min(100, Math.round((earned / forecast) * 100)) : 0;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 shadow-[0_2px_16px_rgba(11,91,211,0.25)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand-100">
            📈 {t('forecastTitle')}
          </p>
          <p className="mt-2 text-3xl font-extrabold text-white">
            {t('forecastOnTrack', { amount: fmt(forecast) })}
          </p>
          <p className="mt-1 text-base text-brand-100">
            {t('forecastDetail', {
              earned: fmt(earned),
              jobs: completedCount,
            })}
          </p>
        </div>
        <div className="rounded-2xl bg-white/15 px-4 py-3 text-center">
          <p className="text-2xl font-extrabold text-white">{activeCount}</p>
          <p className="text-xs font-semibold text-brand-100">
            {t('forecastActive')}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div
          className="h-3 overflow-hidden rounded-full bg-white/20"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('forecastTitle')}
        >
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs font-semibold text-brand-100">
          <span>
            {t('forecastEarned', { amount: fmt(earned) })}
          </span>
          {pipeline > 0 ? (
            <span>{t('forecastPipeline', { amount: fmt(pipeline) })}</span>
          ) : null}
        </div>
      </div>

      {bookings.length === 0 ? (
        <p className="mt-3 text-sm text-brand-100">{t('forecastEmpty')}</p>
      ) : null}
    </div>
  );
}
