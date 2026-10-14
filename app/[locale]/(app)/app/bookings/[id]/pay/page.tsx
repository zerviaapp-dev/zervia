import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/Panel';
import { PaymentPanel } from '@/components/booking/PaymentPanel';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';
import { isStripeTestMode } from '@/lib/stripe';
import { currencyForCountry } from '@/lib/currency';
import type { Currency } from '@/lib/currency';

/**
 * Minimal payment page — bypasses the complex booking detail page
 * which has a client-side crash. Shows just the payment panel.
 */
export default async function BookingPayPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'Bookings' });
  const supabase = await createClient();

  if (!supabase) {
    return <Panel><p>Not configured</p></Panel>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizedPath('/login', locale));
  }

  // Minimal booking fetch — only what we need for payment
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, listings(id, title, price_cents, price_type, country)')
    .eq('id', id)
    .maybeSingle() as { data: {
      id: string;
      customer_id: string;
      provider_id: string;
      status: string;
      listings: { id: string; title: string; price_cents: number | null; price_type: string; country: string | null } | null;
    } | null };

  if (!booking) {
    redirect(localizedPath('/app/bookings', locale));
  }

  // Only the customer can pay
  if (booking.customer_id !== user.id) {
    redirect(localizedPath('/app/bookings', locale));
  }

  // Check escrow
  const { data: escrow } = await supabase
    .from('escrow_payments')
    .select('status, amount_cents, currency')
    .eq('booking_id', booking.id)
    .maybeSingle() as { data: { status: string; amount_cents: number; currency: string | null } | null };

  const country = booking.listings?.country ?? 'CA';
  const priceCurrency = currencyForCountry(country) as Currency;
  const payableAmount = booking.listings?.price_type === 'fixed'
    ? booking.listings?.price_cents ?? null
    : null;

  const canPay = ['pending', 'confirmed'].includes(booking.status) && !escrow;

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-brand-900">{t('detailTitle')}</h1>
      <Panel>
        <p className="text-lg font-semibold">{booking.listings?.title ?? 'Booking'}</p>
        <p className="text-sm text-brand-600">Status: {booking.status}</p>
      </Panel>
      <PaymentPanel
        bookingId={booking.id}
        role="customer"
        status={booking.status}
        escrowStatus={(escrow?.status as 'held' | 'released' | 'refunded' | 'disputed' | null) ?? null}
        amountCents={escrow?.amount_cents ?? payableAmount}
        amountCurrency={(escrow?.currency as Currency) ?? priceCurrency}
        canPay={canPay}
        testMode={isStripeTestMode()}
      />
    </div>
  );
}
