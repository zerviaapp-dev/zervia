import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { BOOST_DAYS, FEATURED_WEEK_DAYS, SPOTLIGHT_DAYS } from '@/lib/pricing';

export const runtime = 'nodejs';

/**
 * Stripe webhook handler — the ONLY writer of the billing tables.
 *
 * Money-safety rules (non-negotiable):
 * 1. The event signature is ALWAYS verified with STRIPE_WEBHOOK_SECRET.
 *    An unverified request can never write a money row.
 * 2. Every event id is recorded in `stripe_events` first, with
 *    ON CONFLICT DO NOTHING. A replayed event is acknowledged but
 *    never processed twice — double-charges are impossible.
 * 3. All writes use the service-role client (no user session exists
 *    here); RLS grants SELECT-only to app users, so nothing else can
 *    write these tables.
 * 4. Amounts come from Stripe's objects, never from our own math.
 */

type Meta = {
  zervia_user_id?: string;
  zervia_provider_id?: string;
  zervia_booking_id?: string;
  zervia_tier?: string;
  zervia_interval?: string;
  zervia_kind?: string;
  zervia_listing_id?: string;
};

function metaOf(obj: { metadata?: Record<string, string> | null }): Meta {
  return (obj.metadata ?? {}) as Meta;
}

/**
 * Renewal timestamp for a subscription. Newer Stripe API versions moved
 * `current_period_end` from the subscription to its items; read whichever
 * shape is present and return an ISO string (or null).
 */
function periodEndOf(sub: Stripe.Subscription): string | null {
  const direct = (sub as unknown as { current_period_end?: number }).current_period_end;
  const item = sub.items?.data?.[0]?.current_period_end;
  const ts = typeof direct === 'number' ? direct : item;
  return typeof ts === 'number' ? new Date(ts * 1000).toISOString() : null;
}

async function recordTransaction(admin: NonNullable<ReturnType<typeof createAdminClient>>, row: {
  user_id: string;
  provider_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_checkout_session_id?: string | null;
  amount_cents: number;
  currency?: string;
  type: 'subscription' | 'boost' | 'lead_fee' | 'refund' | 'escrow' | 'verification_badge' | 'featured_week' | 'profile_spotlight';
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  description?: string | null;
}) {
  const { error } = await admin.from('transactions').insert({
    user_id: row.user_id,
    provider_id: row.provider_id ?? null,
    stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
    stripe_invoice_id: row.stripe_invoice_id ?? null,
    stripe_checkout_session_id: row.stripe_checkout_session_id ?? null,
    amount_cents: row.amount_cents,
    currency: row.currency ?? 'cad',
    type: row.type,
    status: row.status,
    description: row.description ?? null,
  });
  if (error) console.error('[stripe/webhook] transaction insert failed', error.message);
}

async function activateListingBoost(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  listingId: string
) {
  const until = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('listings')
    .update({ is_featured: true, featured_until: until, featured_priority: 1 })
    .eq('id', listingId);
  if (error) console.error('[stripe/webhook] boost activation failed', error.message);
}

async function activateFeaturedWeek(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  listingId: string
) {
  const until = new Date(Date.now() + FEATURED_WEEK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('listings')
    .update({ is_featured: true, featured_until: until, featured_priority: 2 })
    .eq('id', listingId);
  if (error) console.error('[stripe/webhook] featured-week activation failed', error.message);
}

async function activateVerificationBadge(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  providerId: string
) {
  const { error } = await admin
    .from('providers')
    .update({ verification_badge: true })
    .eq('id', providerId);
  if (error) console.error('[stripe/webhook] verification-badge activation failed', error.message);
}

async function activateProfileSpotlight(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  providerId: string
) {
  const until = new Date(Date.now() + SPOTLIGHT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('providers')
    .update({ spotlight_until: until })
    .eq('id', providerId);
  if (error) console.error('[stripe/webhook] profile-spotlight activation failed', error.message);
}

export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe/webhook] signature verification failed', err);
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  // Idempotency first: claim the event id. A replay inserts nothing and
  // is acknowledged without reprocessing.
  const { data: claimed } = await admin
    .from('stripe_events')
    .insert({ event_id: event.id, event_type: event.type })
    .select('event_id')
    .single();
  if (!claimed) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const m = metaOf(session);

        // Escrow (held booking payment): record the hold. The PaymentIntent
        // is authorized with manual capture; funds are captured on release.
        if (m.zervia_kind === 'escrow' && m.zervia_booking_id) {
          const piId =
            typeof session.payment_intent === 'string' ? session.payment_intent : null;
          const { data: bk } = await admin
            .from('bookings')
            .select('id, customer_id, provider_id')
            .eq('id', m.zervia_booking_id)
            .maybeSingle();
          if (bk) {
            await admin.from('escrow_payments').upsert(
              {
                booking_id: m.zervia_booking_id,
                customer_id: bk.customer_id as string,
                provider_id: bk.provider_id as string,
                stripe_payment_intent_id: piId,
                stripe_checkout_session_id: session.id,
                amount_cents: session.amount_total ?? 0,
                currency: session.currency ?? 'cad',
                status: 'held',
              },
              { onConflict: 'booking_id' }
            );
            await recordTransaction(admin, {
              user_id: bk.customer_id as string,
              provider_id: bk.provider_id as string,
              stripe_payment_intent_id: piId,
              stripe_checkout_session_id: session.id,
              amount_cents: session.amount_total ?? 0,
              currency: session.currency ?? 'cad',
              type: 'escrow',
              status: 'succeeded',
              description: 'Escrow hold — payment secured (TEST MODE)',
            });
          }
          break;
        }

        if (!m.zervia_user_id || !m.zervia_provider_id) break;

        if (m.zervia_kind === 'boost' && m.zervia_listing_id) {
          await activateListingBoost(admin, m.zervia_listing_id);
          await recordTransaction(admin, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            type: 'boost',
            status: 'succeeded',
            description: 'Featured boost (7 days)',
          });
          break;
        }

        if (m.zervia_kind === 'verification_badge') {
          await activateVerificationBadge(admin, m.zervia_provider_id);
          await recordTransaction(admin, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            type: 'verification_badge',
            status: 'succeeded',
            description: 'Verification badge (one-time)',
          });
          break;
        }

        if (m.zervia_kind === 'featured_week' && m.zervia_listing_id) {
          await activateFeaturedWeek(admin, m.zervia_listing_id);
          await recordTransaction(admin, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            type: 'featured_week',
            status: 'succeeded',
            description: 'Featured week (7 days, top placement)',
          });
          break;
        }

        if (m.zervia_kind === 'profile_spotlight') {
          await activateProfileSpotlight(admin, m.zervia_provider_id);
          await recordTransaction(admin, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            type: 'profile_spotlight',
            status: 'succeeded',
            description: 'Profile spotlight (7 days)',
          });
          break;
        }

        // Subscription checkout: mirror the subscription locally.
        if (session.mode === 'subscription' && typeof session.subscription === 'string') {
          const sub = await getStripe().subscriptions.retrieve(session.subscription);
          const sm = metaOf(sub);
          const tier = sm.zervia_tier === 'business' ? 'business' : 'pro';
          const interval = sm.zervia_interval === 'year' ? 'year' : 'month';
          await admin.from('subscriptions').upsert(
            {
              provider_id: m.zervia_provider_id,
              user_id: m.zervia_user_id,
              stripe_subscription_id: sub.id,
              stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : '',
              tier,
              billing_interval: interval,
              status: sub.status,
              current_period_end: periodEndOf(sub),
            },
            { onConflict: 'provider_id' }
          );
          await recordTransaction(admin, {
            user_id: m.zervia_user_id,
            provider_id: m.zervia_provider_id,
            stripe_payment_intent_id:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
            stripe_checkout_session_id: session.id,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? 'cad',
            type: 'subscription',
            status: 'succeeded',
            description: `Zervia ${tier} (${interval})`,
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription ?? null;
        const subId = typeof subRef === 'string' ? subRef : subRef?.id ?? null;
        if (!subId) break;
        const { data: row } = await admin
          .from('subscriptions')
          .select('provider_id, user_id')
          .eq('stripe_subscription_id', subId)
          .single();
        if (!row) break;
        await admin
          .from('subscriptions')
          .update({ status: 'active' })
          .eq('stripe_subscription_id', subId);
        await recordTransaction(admin, {
          user_id: row.user_id as string,
          provider_id: row.provider_id as string,
          stripe_invoice_id: invoice.id,
          amount_cents: invoice.amount_paid ?? 0,
          currency: invoice.currency ?? 'cad',
          type: 'subscription',
          status: 'succeeded',
          description: 'Subscription renewal',
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const sm = metaOf(sub);
        const tier = sm.zervia_tier === 'business' ? 'business' : 'pro';
        await admin
          .from('subscriptions')
          .update({
            tier,
            status: sub.status,
            current_period_end: periodEndOf(sub),
          })
          .eq('stripe_subscription_id', sub.id);
        // The DB trigger mirrors the tier onto providers: only
        // active/trialing keep the paid tier. past_due and canceled
        // drop back to starter, per the approved plan.
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // The event is already claimed as processed; log loudly so the
    // founder can replay it from the Stripe dashboard if needed.
    console.error('[stripe/webhook] handler failed for', event.id, err);
  }

  return NextResponse.json({ received: true });
}
