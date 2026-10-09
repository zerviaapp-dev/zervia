import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { currencyForCountry } from '@/lib/currency';
import { localizedPath } from '@/lib/locale-path';
import { takeAsync } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type EscrowCheckoutBody = {
  bookingId?: string;
  locale?: string;
};

/**
 * Create a Stripe Checkout Session for a held (escrow) booking payment.
 *
 * TEST MODE ONLY until FINTRAC/MSB legal review clears live money
 * movement. The PaymentIntent is authorized with MANUAL capture: the
 * customer is charged (held) at checkout, and the funds are captured
 * (released to the provider) when the booking completes — or refunded
 * if the booking is cancelled / disputed in the customer's favour.
 *
 * Amount always comes from server truth: the accepted quote's locked
 * price (bookings.agreed_price_cents), falling back to the listing's
 * fixed price. A tampered request can never change the price.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  // Money endpoints get the strictest bucket: card-testing bots hit these first.
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`stripe_escrow:${ip}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: EscrowCheckoutBody;
  try {
    body = (await req.json()) as EscrowCheckoutBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const bookingId = body.bookingId?.trim();
  if (!bookingId) {
    return NextResponse.json({ error: 'missing_booking' }, { status: 400 });
  }
  const locale = body.locale ?? 'en';

  // Server-truth amount: accepted-quote price, else fixed listing price.
  // The amount is denominated in the PROVIDER's currency — the provider
  // set the price in their own market. The customer is charged that
  // currency at Stripe; the UI converts for display.
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, provider_id, status, agreed_price_cents, listings(id, title, price_cents, price_type), providers(business_name, country)'
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!['pending', 'confirmed'].includes(booking.status as string)) {
    return NextResponse.json({ error: 'booking_not_payable' }, { status: 409 });
  }

  const listing = (
    Array.isArray(booking.listings) ? booking.listings[0] : booking.listings
  ) as { id: string; title: string; price_cents: number | null; price_type: string } | null;
  const provider = (
    Array.isArray(booking.providers) ? booking.providers[0] : booking.providers
  ) as { business_name: string; country?: string | null } | null;

  const currency = currencyForCountry(provider?.country);

  const amount =
    (booking.agreed_price_cents as number | null) ??
    (listing?.price_type === 'fixed' ? listing?.price_cents : null);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'no_agreed_price' }, { status: 409 });
  }

  // One escrow per booking.
  const { data: existing } = await supabase
    .from('escrow_payments')
    .select('id, status')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'already_paid', status: (existing as { status: string }).status },
      { status: 409 }
    );
  }

  const stripe = getStripe();
  const h = await headers();
  const origin = h.get('origin') ?? '';
  const successUrl = `${origin}${localizedPath(`/app/bookings/${bookingId}`, locale)}?payment=success`;
  const cancelUrl = `${origin}${localizedPath(`/app/bookings/${bookingId}`, locale)}?payment=cancelled`;

  const serviceName = listing?.title ?? 'Zervia service';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amount,
          product_data: {
            name: `Zervia escrow — ${serviceName}`,
            description: `Held securely until the job is done. Provider: ${provider?.business_name ?? '—'}. TEST MODE — no real charge.`,
          },
        },
        quantity: 1,
      },
    ],
    // Authorize now, capture on completion. Uncaptured intents auto-release
    // after 7 days, so money can never get stuck.
    payment_intent_data: {
      capture_method: 'manual',
      metadata: {
        zervia_kind: 'escrow',
        zervia_booking_id: bookingId,
        zervia_user_id: user.id,
        zervia_provider_id: booking.provider_id as string,
      },
    },
    metadata: {
      zervia_kind: 'escrow',
      zervia_booking_id: bookingId,
      zervia_user_id: user.id,
      zervia_provider_id: booking.provider_id as string,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return NextResponse.json({ url: session.url });
}
