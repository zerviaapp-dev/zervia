import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { localizedPath } from '@/lib/locale-path';
import { takeAsync } from '@/lib/rate-limit';
import { getDigitalProduct } from '@/lib/digital-products';
import { getSiteOrigin } from '@/lib/site-origin';

export const runtime = 'nodejs';

type DigitalCheckoutBody = {
  slug?: string;
  locale?: string;
};

/**
 * Create a Stripe Checkout Session for a Zervia digital product
 * (ebooks, courses, programs).
 *
 * The price ALWAYS comes from the server-side digital product catalog —
 * the request body only names the product slug, so a tampered request
 * can't change the price. No shipping is collected (digital delivery).
 * No order row is written here; the webhook records the purchase from
 * the session metadata (zervia_kind = 'digital_product_order').
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`stripe_digital_checkout:${ip}`, 10, 60 * 60 * 1000))) {
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

  let body: DigitalCheckoutBody;
  try {
    body = (await req.json()) as DigitalCheckoutBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const slug = String(body.slug ?? '');
  const locale = body.locale ?? 'en';
  if (!slug) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Server-side product lookup — price comes from the catalog, never the client.
  const product = getDigitalProduct(slug);
  if (!product) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const unitPrice = Math.round(product.priceCad * 100);
  const origin = getSiteOrigin(); // SECURE: never trust client Origin header
  const successUrl = `${origin}${localizedPath(`/products/${product.slug}`, locale)}?checkout=success`;
  const cancelUrl = `${origin}${localizedPath(`/products/${product.slug}`, locale)}?checkout=cancelled`;

  const stripe = getStripe();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'cad',
            unit_amount: unitPrice,
            product_data: {
              name: product.title,
              description: `Zervia digital product — ${product.tagline}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        zervia_kind: 'digital_product_order',
        zervia_user_id: user.id,
        zervia_product_slug: product.slug,
      },
      payment_intent_data: {
        metadata: {
          zervia_kind: 'digital_product_order',
          zervia_product_slug: product.slug,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[digital-checkout] stripe error', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
