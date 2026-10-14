import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { localizedPath } from '@/lib/locale-path';
import { takeAsync } from '@/lib/rate-limit';
import { getSiteOrigin } from '@/lib/site-origin';

export const runtime = 'nodejs';

type ProductCheckoutBody = {
  productId?: string;
  quantity?: number;
  locale?: string;
  shipName?: string;
  shipAddress?: string;
  shipCity?: string;
  shipProvince?: string;
  shipPostal?: string;
  shipCountry?: string;
  shipPhone?: string;
};

/**
 * Create a Stripe Checkout Session for a physical product purchase.
 *
 * The price ALWAYS comes from the products table (server-side) — the
 * request body only names the product and quantity, so a tampered
 * request can't change the price. Creates a product_orders row in
 * `pending_payment`; the webhook flips it to paid and triggers CJ
 * fulfillment (or queues it for manual handling when CJ keys are missing).
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`stripe_product_checkout:${ip}`, 10, 60 * 60 * 1000))) {
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

  let body: ProductCheckoutBody;
  try {
    body = (await req.json()) as ProductCheckoutBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const productId = String(body.productId ?? '');
  const quantity = Math.max(1, Math.min(99, Math.floor(Number(body.quantity) || 1)));
  const locale = body.locale ?? 'en';
  if (!productId) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Server-side product lookup — price comes from the DB.
  const { data: product } = (await supabase
    .from('products')
    .select('id, provider_id, name, price_cents, currency, stock, active')
    .eq('id', productId)
    .eq('active', true)
    .maybeSingle()) as {
    data: {
      id: string;
      provider_id: string;
      name: string;
      price_cents: number;
      currency: string;
      stock: number;
      active: boolean;
    } | null;
  };
  if (!product) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (product.stock !== -1 && product.stock < quantity) {
    return NextResponse.json({ error: 'out_of_stock' }, { status: 409 });
  }

  const unitPrice = product.price_cents;
  const subtotal = unitPrice * quantity;
  // Platform fee: 10% for free providers, 5% for members. Provider tier
  // comes from the providers row (membership flag).
  const { data: providerRow } = (await supabase
    .from('providers')
    .select('id, membership_tier')
    .eq('id', product.provider_id)
    .maybeSingle()) as { data: { id: string; membership_tier?: string | null } | null };
  const isMember =
    providerRow?.membership_tier === 'pro' || providerRow?.membership_tier === 'business';
  const feeRate = isMember ? 0.05 : 0.1;
  const platformFee = Math.round(subtotal * feeRate);
  const currency = (product.currency || 'CAD').toLowerCase();

  // Create the order row first (pending_payment). The webhook completes it.
  const { data: order, error: orderError } = (await supabase
    .from('product_orders')
    .insert({
      product_id: product.id,
      provider_id: product.provider_id,
      buyer_id: user.id,
      quantity,
      unit_price_cents: unitPrice,
      platform_fee_cents: platformFee,
      total_cents: subtotal,
      currency: product.currency,
      status: 'pending_payment',
      ship_name: body.shipName ?? null,
      ship_address: body.shipAddress ?? null,
      ship_city: body.shipCity ?? null,
      ship_province: body.shipProvince ?? null,
      ship_postal: body.shipPostal ?? null,
      ship_country: body.shipCountry ?? null,
      ship_phone: body.shipPhone ?? null,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown };
  if (orderError || !order) {
    return NextResponse.json({ error: 'order_create_failed' }, { status: 500 });
  }

  const origin = getSiteOrigin(); // SECURE: never trust client Origin header
  const successUrl = `${origin}${localizedPath('/app/orders', locale)}?checkout=success&order=${order.id}`;
  const cancelUrl = `${origin}${localizedPath('/products/' + product.id, locale)}?checkout=cancelled`;

  const stripe = getStripe();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: unitPrice,
            product_data: {
              name: product.name,
              description: `Zervia product — quantity ${quantity}`,
            },
          },
          quantity,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        zervia_kind: 'product_order',
        zervia_user_id: user.id,
        zervia_provider_id: product.provider_id,
        zervia_order_id: order.id,
        zervia_product_id: product.id,
      },
      payment_intent_data: {
        metadata: {
          zervia_kind: 'product_order',
          zervia_order_id: order.id,
        },
      },
    });

    await supabase
      .from('product_orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[product-checkout] stripe error', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
