import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isPayPalConfigured, paypalApi, paypalPlanId, paypalMode, type PayPalSubscription } from '@/lib/paypal';
import { localizedPath } from '@/lib/locale-path';
import { takeAsync } from '@/lib/rate-limit';
import { getSiteOrigin } from '@/lib/site-origin';

export const runtime = 'nodejs';

type PayPalSubscriptionBody = {
  tier?: 'pro' | 'business';
  interval?: 'month' | 'year';
  locale?: string;
};

/**
 * Create a PayPal subscription for a provider membership (pro /
 * business, monthly / yearly).
 *
 * Requires PayPal billing PLAN IDs created once in the PayPal
 * dashboard (Subscriptions → Plans) and pasted into env:
 *   PAYPAL_PLAN_PRO_MONTHLY / _YEARLY
 *   PAYPAL_PLAN_BUSINESS_MONTHLY / _YEARLY
 * See .env.example. Without them this route returns
 * `plan_not_configured`.
 *
 * Returns { approvalUrl } — the buyer approves on PayPal, then the
 * webhook (BILLING.SUBSCRIPTION.ACTIVATED) mirrors the subscription
 * locally, exactly like the Stripe invoice.paid path.
 */
export async function POST(req: NextRequest) {
  if (!isPayPalConfigured()) {
    return NextResponse.json({ error: 'paypal_not_configured' }, { status: 503 });
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown';
  if (!(await takeAsync(`paypal_sub:${ip}`, 10, 60 * 60 * 1000))) {
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

  const { data: provider } = await supabase
    .from('providers')
    .select('id, business_name')
    .eq('user_id', user.id)
    .single();
  if (!provider) {
    return NextResponse.json({ error: 'not_a_provider' }, { status: 403 });
  }

  let body: PayPalSubscriptionBody;
  try {
    body = (await req.json()) as PayPalSubscriptionBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const tier = body.tier === 'business' ? 'business' : 'pro';
  const interval = body.interval === 'year' ? 'year' : 'month';
  const planId = paypalPlanId(tier, interval);
  if (!planId) {
    return NextResponse.json({ error: 'plan_not_configured' }, { status: 503 });
  }

  const locale = body.locale ?? 'en';
  const origin = getSiteOrigin(); // SECURE: never trust client Origin header

  try {
    const sub = await paypalApi<PayPalSubscription>('/v1/billing/subscriptions', {
      method: 'POST',
      requestId: `zervia-sub-${provider.id}-${tier}-${interval}-${Date.now()}`,
      body: {
        plan_id: planId,
        custom_id: JSON.stringify({
          user_id: user.id,
          provider_id: provider.id,
          tier,
          interval,
        }),
        application_context: {
          brand_name: 'Zervia',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${origin}${localizedPath('/app/billing', locale)}?checkout=success`,
          cancel_url: `${origin}${localizedPath('/app/billing', locale)}?checkout=cancelled`,
        },
      },
    });
    const approvalUrl = sub.links?.find((l) => l.rel === 'approve')?.href;
    if (!approvalUrl) {
      console.error('[paypal/subscription] no approval link', sub.id);
      return NextResponse.json({ error: 'paypal_error' }, { status: 502 });
    }
    return NextResponse.json({ approvalUrl, subscriptionId: sub.id, mode: paypalMode() });
  } catch (err) {
    console.error('[paypal/subscription]', err);
    return NextResponse.json({ error: 'paypal_error' }, { status: 502 });
  }
}
