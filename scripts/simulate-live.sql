-- ============================================================================
-- ZERVIA LIVE SIMULATION DATA
-- ============================================================================
-- FOR TESTING ONLY — REMOVE BEFORE PUBLIC LAUNCH.
--
-- Simulates a LIVE marketplace with realistic dummy data:
--   8 fake providers (varied categories, cities, tiers, statuses),
--   16 fake listings (fixed / hourly / quote pricing),
--   15 fake bookings (ALL statuses: pending, confirmed, in_progress,
--     completed, cancelled, disputed),
--   8 fake reviews (ratings 1–5 spread),
--   14 fake escrow records (held / released / refunded / disputed),
--   8 fake payouts (paid / pending / processing),
--   1 fake guarantee claim (pending).
--
-- This exercises the FULL lifecycle: discovery → booking → payment →
-- escrow → completion → payout → review → dispute → refund → claim.
--
-- HOW TO RUN (Supabase SQL Editor, as service_role / postgres superuser
-- so RLS does not block the inserts):
--
--   1. Create test auth accounts via the app's normal signup, e.g.
--      zerviaapp+sim1@gmail.com ... sim8 (providers), zerviaapp+cust1..3
--      (customers). 8 providers need 8 DISTINCT users (user_id is UNIQUE).
--   2. Copy each account's user UUID from Authentication > Users.
--   3. Paste the UUIDs into the \set block below.
--   4. Run the whole script. It is IDEMPOTENT: it deletes any previous
--      [TEST] rows first, so re-running is safe.
--
-- NAMING CONVENTION: every seeded row is marked [TEST] so the pre-launch
-- cleanup finds it with a single LIKE '[TEST]%' query. Phones use the
-- reserved 555-01XX fiction range. Stripe IDs use fake pi_test_sim_XXX /
-- tr_test_sim_XXX values — they NEVER touch real Stripe.
--
-- CLEANUP: docs/PRELAUNCH_CLEANUP.md has the deletion queries.
-- NEVER run this on a database with real users.
-- ============================================================================

-- ── 1. Test user UUIDs (REPLACE THESE — must exist in public.profiles) ──────
-- NOTE: psql \set takes the value literally — do NOT wrap in quotes.
-- 8 providers need 8 DISTINCT users; 3 customers are reused across bookings.
\set sp1 REPLACE-WITH-SIM-PROVIDER-1-UUID
\set sp2 REPLACE-WITH-SIM-PROVIDER-2-UUID
\set sp3 REPLACE-WITH-SIM-PROVIDER-3-UUID
\set sp4 REPLACE-WITH-SIM-PROVIDER-4-UUID
\set sp5 REPLACE-WITH-SIM-PROVIDER-5-UUID
\set sp6 REPLACE-WITH-SIM-PROVIDER-6-UUID
\set sp7 REPLACE-WITH-SIM-PROVIDER-7-UUID
\set sp8 REPLACE-WITH-SIM-PROVIDER-8-UUID
\set sc1 REPLACE-WITH-SIM-CUSTOMER-1-UUID
\set sc2 REPLACE-WITH-SIM-CUSTOMER-2-UUID
\set sc3 REPLACE-WITH-SIM-CUSTOMER-3-UUID

-- ── 2. Guard: fail fast with a FRIENDLY error if UUIDs are missing/invalid ───
DO $$
DECLARE
  raw  text[] := ARRAY[:'sp1', :'sp2', :'sp3', :'sp4', :'sp5', :'sp6', :'sp7', :'sp8', :'sc1', :'sc2', :'sc3'];
  ids  uuid[];
  missing uuid[];
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(raw) AS r
    WHERE r !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) THEN
    RAISE EXCEPTION
      'Simulation aborted: paste real test-user UUIDs into the \set block at the top. Find them in Supabase > Authentication > Users (create the test accounts via app signup first).';
  END IF;
  SELECT array_agg(r::uuid) INTO ids FROM unnest(raw) AS r;
  SELECT array_agg(u) INTO missing
  FROM unnest(ids) AS u
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u);
  IF missing IS NOT NULL AND array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION
      'Simulation aborted: these test user UUIDs have no public.profiles row: %. Create the test accounts via app signup first, then re-run.',
      missing;
  END IF;
  RAISE NOTICE 'All 11 simulation users found in public.profiles. Simulating live marketplace…';
END $$;

BEGIN;

-- ── 3. Idempotency: wipe any previous [TEST] rows (FK order) ────────────────
DELETE FROM public.guarantee_claims
 WHERE booking_id IN (SELECT id FROM public.bookings WHERE notes LIKE '[TEST]%');
DELETE FROM public.reviews
 WHERE text LIKE '[TEST]%';
DELETE FROM public.payouts
 WHERE provider_id IN (SELECT id FROM public.providers WHERE business_name LIKE '[TEST]%');
DELETE FROM public.escrow_payments
 WHERE booking_id IN (SELECT id FROM public.bookings WHERE notes LIKE '[TEST]%');
DELETE FROM public.bookings
 WHERE notes LIKE '[TEST]%';
DELETE FROM public.listings
 WHERE title LIKE '[TEST]%';
DELETE FROM public.providers
 WHERE business_name LIKE '[TEST]%';

-- ── 4. Providers (8 — varied categories, cities, tiers, statuses) ────────────
CREATE TEMP TABLE sim_providers (slot int PRIMARY KEY, id uuid NOT NULL);

WITH ins AS (
  INSERT INTO public.providers
    (user_id, business_name, category, description, country, city,
     phone, whatsapp, languages, status, subscription_tier,
     agreement_version, agreement_accepted_at, agreement_initials,
     id_verified)
  VALUES
    (:'sp1'::uuid, '[TEST] Maple Clean Co', 'cleaning',
     '[TEST] Dummy cleaning business for simulation. Not a real business.',
     'CA', 'Calgary', '+1 555-0101', '+1 555-0101', '{en}',
     'approved', 'starter', '2026-10-11-v3', now() - interval '20 days', 'MC', true),
    (:'sp2'::uuid, '[TEST] Bright Spark Electric', 'electrical',
     '[TEST] Dummy electrical business for simulation. Not a real business.',
     'CA', 'Edmonton', '+1 555-0102', NULL, '{en}',
     'approved', 'pro', '2026-10-11-v3', now() - interval '18 days', 'BS', true),
    (:'sp3'::uuid, '[TEST] Lolo Moving Helpers', 'moving',
     '[TEST] Dummy moving business for simulation. Not a real business.',
     'CA', 'Vancouver', '+1 555-0103', '+1 555-0103', '{en,tl}',
     'approved', 'starter', '2026-10-11-v3', now() - interval '15 days', 'LM', true),
    (:'sp4'::uuid, '[TEST] Pixel Web Studio', 'tech',
     '[TEST] Dummy web-dev business for simulation. Not a real business.',
     'US', 'Austin', '+1 555-0104', NULL, '{en,es}',
     'approved', 'business', '2026-10-11-v3', now() - interval '12 days', 'PW', true),
    (:'sp5'::uuid, '[TEST] Green Thumb Gardens', 'landscaping',
     '[TEST] Dummy landscaping business for simulation. Not a real business.',
     'CA', 'Toronto', '+1 555-0105', '+1 555-0105', '{en,fr}',
     'approved', 'pro', '2026-10-11-v3', now() - interval '10 days', 'GT', true),
    (:'sp6'::uuid, '[TEST] Quick Fix Handyman', 'handyman',
     '[TEST] Dummy handyman business for simulation. Not a real business.',
     'CA', 'Winnipeg', '+1 555-0106', NULL, '{en}',
     'approved', 'starter', '2026-10-11-v3', now() - interval '8 days', 'QF', true),
    (:'sp7'::uuid, '[TEST] Pending Plumbing Pros', 'plumbing',
     '[TEST] Dummy plumbing business — intentionally PENDING to exercise the admin approval queue.',
     'CA', 'Calgary', '+1 555-0107', NULL, '{en}',
     'pending', 'starter', '2026-10-11-v3', now() - interval '2 days', 'PP', false),
    (:'sp8'::uuid, '[TEST] Rejected Roofing Co', 'roofing',
     '[TEST] Dummy roofing business — intentionally REJECTED to exercise the rejection flow.',
     'CA', 'Edmonton', '+1 555-0108', NULL, '{en}',
     'rejected', 'starter', '2026-10-11-v3', now() - interval '5 days', 'RR', false)
  RETURNING id
)
INSERT INTO sim_providers (slot, id)
SELECT row_number() OVER (), id FROM ins;

-- ── 5. Listings (16 — fixed / hourly / quote; active / paused / draft) ───────
CREATE TEMP TABLE sim_listings (slot int PRIMARY KEY, id uuid NOT NULL);

WITH ins AS (
  INSERT INTO public.listings
    (provider_id, title, description, category, price_cents, price_type,
     country, city, status, is_featured)
  VALUES
    -- P1: cleaning (Calgary)
    ((SELECT id FROM sim_providers WHERE slot = 1),
     '[TEST] Standard Home Cleaning', '[TEST] Dummy listing for simulation. 2-bed home, all rooms, supplies included.',
     'cleaning', 2500, 'fixed', 'CA', 'Calgary', 'active', false),
    ((SELECT id FROM sim_providers WHERE slot = 1),
     '[TEST] Deep Clean (Hourly)', '[TEST] Dummy listing for simulation. Move-in/move-out deep clean, billed hourly.',
     'cleaning', 3500, 'hourly', 'CA', 'Calgary', 'active', false),
    -- P2: electrical (Edmonton)
    ((SELECT id FROM sim_providers WHERE slot = 2),
     '[TEST] Outlet & Switch Install', '[TEST] Dummy listing for simulation. Licensed install, parts included.',
     'electrical', 8500, 'fixed', 'CA', 'Edmonton', 'active', false),
    ((SELECT id FROM sim_providers WHERE slot = 2),
     '[TEST] Electrical Troubleshooting (Hourly)', '[TEST] Dummy listing for simulation. Diagnostic + repair, hourly rate.',
     'electrical', 9500, 'hourly', 'CA', 'Edmonton', 'paused', false),
    -- P3: moving (Vancouver)
    ((SELECT id FROM sim_providers WHERE slot = 3),
     '[TEST] 2-Mover Local Move', '[TEST] Dummy listing for simulation. Truck + 2 movers, up to 3 hours.',
     'moving', 12000, 'fixed', 'CA', 'Vancouver', 'active', false),
    ((SELECT id FROM sim_providers WHERE slot = 3),
     '[TEST] Custom Moving Quote', '[TEST] Dummy listing for simulation. Long-distance and large moves — price on request.',
     'moving', NULL, 'quote', 'CA', 'Vancouver', 'active', false),
    -- P4: tech (Austin)
    ((SELECT id FROM sim_providers WHERE slot = 4),
     '[TEST] Landing Page Build', '[TEST] Dummy listing for simulation. 5-page responsive site, 2 revision rounds.',
     'tech', 50000, 'fixed', 'US', 'Austin', 'active', false),
    ((SELECT id FROM sim_providers WHERE slot = 4),
     '[TEST] Hourly Dev Support', '[TEST] Dummy listing for simulation. Bug fixes, features, code review.',
     'tech', 7500, 'hourly', 'US', 'Austin', 'active', false),
    ((SELECT id FROM sim_providers WHERE slot = 4),
     '[TEST] Mobile App MVP', '[TEST] Dummy listing for simulation. iOS + Android MVP, 6-week delivery.',
     'tech', 150000, 'fixed', 'US', 'Austin', 'active', true),
    -- P5: landscaping (Toronto)
    ((SELECT id FROM sim_providers WHERE slot = 5),
     '[TEST] Lawn Mowing & Edging', '[TEST] Dummy listing for simulation. Weekly or bi-weekly service.',
     'landscaping', 4500, 'fixed', 'CA', 'Toronto', 'active', false),
    ((SELECT id FROM sim_providers WHERE slot = 5),
     '[TEST] Garden Design Consultation', '[TEST] Dummy listing for simulation. On-site design plan — price on request.',
     'landscaping', NULL, 'quote', 'CA', 'Toronto', 'active', false),
    -- P6: handyman (Winnipeg)
    ((SELECT id FROM sim_providers WHERE slot = 6),
     '[TEST] Furniture Assembly', '[TEST] Dummy listing for simulation. IKEA and flat-pack specialists.',
     'handyman', 6000, 'fixed', 'CA', 'Winnipeg', 'active', false),
    ((SELECT id FROM sim_providers WHERE slot = 6),
     '[TEST] Home Repairs (Hourly)', '[TEST] Dummy listing for simulation. Drywall, paint touch-ups, minor fixes.',
     'handyman', 5500, 'hourly', 'CA', 'Winnipeg', 'active', false),
    -- P7: plumbing (Calgary) — provider pending, listings stay draft
    ((SELECT id FROM sim_providers WHERE slot = 7),
     '[TEST] Faucet Replacement', '[TEST] Dummy listing for simulation.',
     'plumbing', 9900, 'fixed', 'CA', 'Calgary', 'draft', false),
    ((SELECT id FROM sim_providers WHERE slot = 7),
     '[TEST] Drain Cleaning (Hourly)', '[TEST] Dummy listing for simulation.',
     'plumbing', 8000, 'hourly', 'CA', 'Calgary', 'draft', false),
    -- P8: roofing (Edmonton) — provider rejected, listing stays draft
    ((SELECT id FROM sim_providers WHERE slot = 8),
     '[TEST] Roof Inspection', '[TEST] Dummy listing for simulation.',
     'roofing', 15000, 'fixed', 'CA', 'Edmonton', 'draft', false)
  RETURNING id
)
INSERT INTO sim_listings (slot, id)
SELECT row_number() OVER (), id FROM ins;

-- ── 6. Bookings (15 — every status: 8 completed, 2 confirmed, 2 in_progress,
--        2 pending, 1 cancelled, 1 disputed) ──────────────────────────────────
CREATE TEMP TABLE sim_bookings (slot int PRIMARY KEY, id uuid NOT NULL);

WITH ins AS (
  INSERT INTO public.bookings
    (listing_id, customer_id, provider_id, scheduled_at, status, notes)
  VALUES
    -- 8 completed (review + escrow-release + payout targets)
    ((SELECT id FROM sim_listings WHERE slot = 1),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 1),
     now() - interval '14 days', 'completed', '[TEST] Sim booking — completed, 5-star.'),
    ((SELECT id FROM sim_listings WHERE slot = 3),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 2),
     now() - interval '12 days', 'completed', '[TEST] Sim booking — completed, 4-star.'),
    ((SELECT id FROM sim_listings WHERE slot = 5),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 3),
     now() - interval '10 days', 'completed', '[TEST] Sim booking — completed, 5-star.'),
    ((SELECT id FROM sim_listings WHERE slot = 7),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
     now() - interval '9 days', 'completed', '[TEST] Sim booking — completed, 3-star.'),
    ((SELECT id FROM sim_listings WHERE slot = 2),
     :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 1),
     now() - interval '7 days', 'completed', '[TEST] Sim booking — completed, 2-star.'),
    ((SELECT id FROM sim_listings WHERE slot = 10),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 5),
     now() - interval '6 days', 'completed', '[TEST] Sim booking — completed, 1-star.'),
    ((SELECT id FROM sim_listings WHERE slot = 12),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 6),
     now() - interval '5 days', 'completed', '[TEST] Sim booking — completed, 4-star.'),
    ((SELECT id FROM sim_listings WHERE slot = 8),
     :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
     now() - interval '4 days', 'completed', '[TEST] Sim booking — completed, 5-star.'),
    -- 2 confirmed (payment held, job upcoming)
    ((SELECT id FROM sim_listings WHERE slot = 13),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 6),
     now() + interval '3 days', 'confirmed', '[TEST] Sim booking — confirmed, upcoming.'),
    ((SELECT id FROM sim_listings WHERE slot = 6),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 3),
     now() + interval '5 days', 'confirmed', '[TEST] Sim booking — confirmed, quote accepted.'),
    -- 2 in_progress (job underway, payment held)
    ((SELECT id FROM sim_listings WHERE slot = 11),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 5),
     now() - interval '1 day', 'in_progress', '[TEST] Sim booking — in progress, garden consult.'),
    ((SELECT id FROM sim_listings WHERE slot = 9),
     :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
     now() - interval '2 days', 'in_progress', '[TEST] Sim booking — in progress, app MVP.'),
    -- 2 pending (awaiting provider confirmation)
    ((SELECT id FROM sim_listings WHERE slot = 9),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
     now() + interval '7 days', 'pending', '[TEST] Sim booking — pending provider confirmation.'),
    ((SELECT id FROM sim_listings WHERE slot = 2),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 1),
     now() + interval '4 days', 'pending', '[TEST] Sim booking — pending, no payment yet.'),
    -- 1 cancelled (payment refunded)
    ((SELECT id FROM sim_listings WHERE slot = 4),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 2),
     now() - interval '3 days', 'cancelled', '[TEST] Sim booking — cancelled by customer, refunded.'),
    -- 1 disputed (payment frozen, awaiting admin)
    ((SELECT id FROM sim_listings WHERE slot = 3),
     :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 2),
     now() - interval '8 days', 'disputed', '[TEST] Sim booking — disputed, awaiting admin resolution.')
  RETURNING id
)
INSERT INTO sim_bookings (slot, id)
SELECT row_number() OVER (), id FROM ins;

-- Dispute metadata on the disputed booking (slot 16)
UPDATE public.bookings
SET dispute_reason = '[TEST] Sim dispute — customer claims work was incomplete.',
    disputed_by = :'sc3'::uuid
WHERE id = (SELECT id FROM sim_bookings WHERE slot = 16);

-- ── 7. Reviews (8 — one per completed booking; ratings 5,4,5,3,2,1,4,5) ─────
-- The refresh_provider_rating trigger recomputes rating_avg / review_count.
INSERT INTO public.reviews (booking_id, reviewer_id, provider_id, rating, text)
VALUES
  ((SELECT id FROM sim_bookings WHERE slot = 1),
   :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 1),
   5, '[TEST] Sim review — spotless work, on time, would book again.'),
  ((SELECT id FROM sim_bookings WHERE slot = 2),
   :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 2),
   4, '[TEST] Sim review — good work, arrived 20 minutes late.'),
  ((SELECT id FROM sim_bookings WHERE slot = 3),
   :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 3),
   5, '[TEST] Sim review — careful with furniture, fast and friendly.'),
  ((SELECT id FROM sim_bookings WHERE slot = 4),
   :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
   3, '[TEST] Sim review — decent site, communication could be better.'),
  ((SELECT id FROM sim_bookings WHERE slot = 5),
   :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 1),
   2, '[TEST] Sim review — missed the bathrooms, had to rebook.'),
  ((SELECT id FROM sim_bookings WHERE slot = 6),
   :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 5),
   1, '[TEST] Sim review — lawn half-mowed, no response to messages.'),
  ((SELECT id FROM sim_bookings WHERE slot = 7),
   :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 6),
   4, '[TEST] Sim review — solid assembly work, fair price.'),
  ((SELECT id FROM sim_bookings WHERE slot = 8),
   :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
   5, '[TEST] Sim review — excellent dev, shipped ahead of schedule.');

-- ── 8. Escrow payments (14 — released / held / refunded / disputed) ──────────
-- Fake Stripe IDs (pi_test_sim_XXX) — NEVER touch real Stripe.
CREATE TEMP TABLE sim_escrow (slot int PRIMARY KEY, id uuid NOT NULL);

WITH ins AS (
  INSERT INTO public.escrow_payments
    (booking_id, customer_id, provider_id,
     stripe_payment_intent_id, stripe_checkout_session_id,
     amount_cents, currency, status, released_at, refunded_at, created_at)
  VALUES
    -- 8 released (completed bookings)
    ((SELECT id FROM sim_bookings WHERE slot = 1),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 1),
     'pi_test_sim_001', 'cs_test_sim_001', 2500, 'cad', 'released',
     now() - interval '13 days', NULL, now() - interval '14 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 2),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 2),
     'pi_test_sim_002', 'cs_test_sim_002', 8500, 'cad', 'released',
     now() - interval '11 days', NULL, now() - interval '12 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 3),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 3),
     'pi_test_sim_003', 'cs_test_sim_003', 12000, 'cad', 'released',
     now() - interval '9 days', NULL, now() - interval '10 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 4),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
     'pi_test_sim_004', 'cs_test_sim_004', 50000, 'usd', 'released',
     now() - interval '8 days', NULL, now() - interval '9 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 5),
     :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 1),
     'pi_test_sim_005', 'cs_test_sim_005', 3500, 'cad', 'released',
     now() - interval '6 days', NULL, now() - interval '7 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 6),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 5),
     'pi_test_sim_006', 'cs_test_sim_006', 4500, 'cad', 'released',
     now() - interval '5 days', NULL, now() - interval '6 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 7),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 6),
     'pi_test_sim_007', 'cs_test_sim_007', 6000, 'cad', 'released',
     now() - interval '4 days', NULL, now() - interval '5 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 8),
     :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
     'pi_test_sim_008', 'cs_test_sim_008', 7500, 'usd', 'released',
     now() - interval '3 days', NULL, now() - interval '4 days'),
    -- 4 held (confirmed + in_progress bookings)
    ((SELECT id FROM sim_bookings WHERE slot = 9),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 6),
     'pi_test_sim_009', 'cs_test_sim_009', 5500, 'cad', 'held',
     NULL, NULL, now() - interval '2 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 10),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 3),
     'pi_test_sim_010', 'cs_test_sim_010', 15000, 'cad', 'held',
     NULL, NULL, now() - interval '2 days'),
    ((SELECT id FROM sim_bookings WHERE slot = 11),
     :'sc2'::uuid, (SELECT id FROM sim_providers WHERE slot = 5),
     'pi_test_sim_011', 'cs_test_sim_011', 20000, 'cad', 'held',
     NULL, NULL, now() - interval '1 day'),
    ((SELECT id FROM sim_bookings WHERE slot = 12),
     :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
     'pi_test_sim_012', 'cs_test_sim_012', 150000, 'usd', 'held',
     NULL, NULL, now() - interval '1 day'),
    -- 1 held (pending booking with upfront payment)
    ((SELECT id FROM sim_bookings WHERE slot = 13),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 4),
     'pi_test_sim_013', 'cs_test_sim_013', 150000, 'usd', 'held',
     NULL, NULL, now() - interval '12 hours'),
    -- 1 refunded (cancelled booking)
    ((SELECT id FROM sim_bookings WHERE slot = 15),
     :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 2),
     'pi_test_sim_014', 'cs_test_sim_014', 9500, 'cad', 'refunded',
     NULL, now() - interval '2 days', now() - interval '3 days'),
    -- 1 disputed (frozen awaiting admin)
    ((SELECT id FROM sim_bookings WHERE slot = 16),
     :'sc3'::uuid, (SELECT id FROM sim_providers WHERE slot = 2),
     'pi_test_sim_015', 'cs_test_sim_015', 8500, 'cad', 'disputed',
     NULL, NULL, now() - interval '8 days')
  RETURNING id
)
INSERT INTO sim_escrow (slot, id)
SELECT row_number() OVER (), id FROM ins;
-- NOTE: booking slot 14 (pending, no payment yet) intentionally has NO escrow row.

-- ── 9. Payouts (8 — one per released escrow; paid / pending / processing) ────
-- Platform fee: 10% starter, 5% pro/business. Fake transfer IDs.
WITH ins AS (
  INSERT INTO public.payouts
    (provider_id, booking_id, escrow_payment_id,
     stripe_transfer_id, amount_cents, platform_fee_cents,
     currency, status, paid_at, created_at)
  VALUES
    -- P1 starter 10%: 2500 → fee 250, net 2250 — paid
    ((SELECT id FROM sim_providers WHERE slot = 1),
     (SELECT id FROM sim_bookings WHERE slot = 1),
     (SELECT id FROM sim_escrow WHERE slot = 1),
     'tr_test_sim_001', 2250, 250, 'cad', 'paid',
     now() - interval '12 days', now() - interval '13 days'),
    -- P2 pro 5%: 8500 → fee 425, net 8075 — paid
    ((SELECT id FROM sim_providers WHERE slot = 2),
     (SELECT id FROM sim_bookings WHERE slot = 2),
     (SELECT id FROM sim_escrow WHERE slot = 2),
     'tr_test_sim_002', 8075, 425, 'cad', 'paid',
     now() - interval '10 days', now() - interval '11 days'),
    -- P3 starter 10%: 12000 → fee 1200, net 10800 — pending
    ((SELECT id FROM sim_providers WHERE slot = 3),
     (SELECT id FROM sim_bookings WHERE slot = 3),
     (SELECT id FROM sim_escrow WHERE slot = 3),
     'tr_test_sim_003', 10800, 1200, 'cad', 'pending',
     NULL, now() - interval '9 days'),
    -- P4 business 5%: 50000 → fee 2500, net 47500 — processing
    ((SELECT id FROM sim_providers WHERE slot = 4),
     (SELECT id FROM sim_bookings WHERE slot = 4),
     (SELECT id FROM sim_escrow WHERE slot = 4),
     'tr_test_sim_004', 47500, 2500, 'usd', 'processing',
     NULL, now() - interval '8 days'),
    -- P1 starter 10%: 3500 → fee 350, net 3150 — paid
    ((SELECT id FROM sim_providers WHERE slot = 1),
     (SELECT id FROM sim_bookings WHERE slot = 5),
     (SELECT id FROM sim_escrow WHERE slot = 5),
     'tr_test_sim_005', 3150, 350, 'cad', 'paid',
     now() - interval '5 days', now() - interval '6 days'),
    -- P5 pro 5%: 4500 → fee 225, net 4275 — paid
    ((SELECT id FROM sim_providers WHERE slot = 5),
     (SELECT id FROM sim_bookings WHERE slot = 6),
     (SELECT id FROM sim_escrow WHERE slot = 6),
     'tr_test_sim_006', 4275, 225, 'cad', 'paid',
     now() - interval '4 days', now() - interval '5 days'),
    -- P6 starter 10%: 6000 → fee 600, net 5400 — paid
    ((SELECT id FROM sim_providers WHERE slot = 6),
     (SELECT id FROM sim_bookings WHERE slot = 7),
     (SELECT id FROM sim_escrow WHERE slot = 7),
     'tr_test_sim_007', 5400, 600, 'cad', 'paid',
     now() - interval '3 days', now() - interval '4 days'),
    -- P4 business 5%: 7500 → fee 375, net 7125 — pending
    ((SELECT id FROM sim_providers WHERE slot = 4),
     (SELECT id FROM sim_bookings WHERE slot = 8),
     (SELECT id FROM sim_escrow WHERE slot = 8),
     'tr_test_sim_008', 7125, 375, 'usd', 'pending',
     NULL, now() - interval '3 days')
  RETURNING id
)
SELECT count(*) AS payouts_seeded FROM ins;

-- ── 10. Guarantee claim (1 — pending, on a completed first-session booking) ──
INSERT INTO public.guarantee_claims
  (booking_id, customer_id, provider_id, category, reason, status, refund_cents)
VALUES
  ((SELECT id FROM sim_bookings WHERE slot = 6),
   :'sc1'::uuid, (SELECT id FROM sim_providers WHERE slot = 5),
   'landscaping',
   '[TEST] Sim claim — first session was unsatisfactory, requesting full refund per guarantee.',
   'pending', 4500);

COMMIT;

-- ── 11. Verification: what got simulated ─────────────────────────────────────
SELECT 'providers' AS tbl, count(*) FROM public.providers WHERE business_name LIKE '[TEST]%'
UNION ALL
SELECT 'listings', count(*) FROM public.listings WHERE title LIKE '[TEST]%'
UNION ALL
SELECT 'bookings', count(*) FROM public.bookings WHERE notes LIKE '[TEST]%'
UNION ALL
SELECT 'reviews', count(*) FROM public.reviews WHERE text LIKE '[TEST]%'
UNION ALL
SELECT 'escrow_payments', count(*) FROM public.escrow_payments e
  JOIN public.bookings b ON b.id = e.booking_id WHERE b.notes LIKE '[TEST]%'
UNION ALL
SELECT 'payouts', count(*) FROM public.payouts p
  JOIN public.providers pr ON pr.id = p.provider_id WHERE pr.business_name LIKE '[TEST]%'
UNION ALL
SELECT 'guarantee_claims', count(*) FROM public.guarantee_claims g
  JOIN public.bookings b ON b.id = g.booking_id WHERE b.notes LIKE '[TEST]%';

-- Expected: providers 8 | listings 16 | bookings 16 | reviews 8 |
--           escrow_payments 15 | payouts 8 | guarantee_claims 1

-- Spot-check booking status coverage:
SELECT status, count(*) FROM public.bookings WHERE notes LIKE '[TEST]%'
GROUP BY status ORDER BY status;

-- Spot-check escrow status coverage:
SELECT e.status, count(*) FROM public.escrow_payments e
JOIN public.bookings b ON b.id = e.booking_id
WHERE b.notes LIKE '[TEST]%' GROUP BY e.status ORDER BY e.status;

-- Spot-check provider ratings (trigger-maintained):
SELECT business_name, status, subscription_tier, rating_avg, review_count
FROM public.providers
WHERE business_name LIKE '[TEST]%'
ORDER BY business_name;
