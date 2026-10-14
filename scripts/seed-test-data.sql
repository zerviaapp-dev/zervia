-- ============================================================================
-- ZERVIA TEST SEED DATA
-- ============================================================================
-- FOR TESTING ONLY — REMOVE BEFORE PUBLIC LAUNCH.
--
-- Seeds clearly-marked dummy data for QA / usability testing:
--   5 fake providers, 10 fake listings, 7 fake bookings, 5 fake reviews.
--
-- HOW TO RUN (Supabase SQL Editor, as a service_role / postgres superuser
-- so RLS does not block the inserts):
--
--   1. Create (or reuse) test auth accounts via the app's normal signup,
--      e.g. zerviaapp+provider1@gmail.com ... provider5, +customer1, +customer2.
--   2. Copy each account's user UUID from Authentication > Users (or run the
--      "Look up test user UUIDs" query at the bottom of
--      docs/PRELAUNCH_CLEANUP.md).
--   3. Paste the UUIDs into the \set block below.
--   4. Run the whole script. It is IDEMPOTENT: it deletes any previous
--      [TEST] rows first, so re-running is safe.
--
-- NAMING CONVENTION: every seeded row is marked [TEST] so the pre-launch
-- cleanup can find and delete it with a single LIKE '[TEST]%' query.
-- Phone numbers use the reserved 555-01XX fiction range; emails (where a
-- column exists) would use @example.com. No real personal data anywhere.
--
-- CLEANUP: docs/PRELAUNCH_CLEANUP.md has the deletion queries.
-- ============================================================================

-- ── 1. Test user UUIDs (REPLACE THESE — must exist in public.profiles) ──────
-- NOTE: psql \set takes the value literally — do NOT wrap in quotes.
-- providers need 5 DISTINCT users (providers.user_id is UNIQUE, one per user)
\set tp1 REPLACE-WITH-TEST-PROVIDER-1-UUID
\set tp2 REPLACE-WITH-TEST-PROVIDER-2-UUID
\set tp3 REPLACE-WITH-TEST-PROVIDER-3-UUID
\set tp4 REPLACE-WITH-TEST-PROVIDER-4-UUID
\set tp5 REPLACE-WITH-TEST-PROVIDER-5-UUID
-- customers (2 is enough; reused across bookings)
\set tc1 REPLACE-WITH-TEST-CUSTOMER-1-UUID
\set tc2 REPLACE-WITH-TEST-CUSTOMER-2-UUID

-- ── 2. Guard: fail fast with a FRIENDLY error if UUIDs are missing/invalid ───
DO $$
DECLARE
  raw  text[] := ARRAY[:'tp1', :'tp2', :'tp3', :'tp4', :'tp5', :'tc1', :'tc2'];
  ids  uuid[];
  missing uuid[];
BEGIN
  -- every value must look like a UUID, else the tester forgot to paste them in
  IF EXISTS (
    SELECT 1 FROM unnest(raw) AS r
    WHERE r !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) THEN
    RAISE EXCEPTION
      'Seed aborted: paste real test-user UUIDs into the \set block at the top of this script. Find them in Supabase > Authentication > Users (create the test accounts via the app signup first).';
  END IF;
  SELECT array_agg(r::uuid) INTO ids FROM unnest(raw) AS r;
  SELECT array_agg(u) INTO missing
  FROM unnest(ids) AS u
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u);
  IF missing IS NOT NULL AND array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION
      'Seed aborted: these test user UUIDs have no public.profiles row: %. Create the test accounts via app signup first, then re-run.',
      missing;
  END IF;
  RAISE NOTICE 'All 7 test users found in public.profiles. Seeding…';
END $$;

BEGIN;

-- ── 3. Idempotency: wipe any previous [TEST] seed rows (FK order) ────────────
DELETE FROM public.reviews
 WHERE text LIKE '[TEST]%';
DELETE FROM public.escrow_payments
 WHERE booking_id IN (
   SELECT id FROM public.bookings WHERE notes LIKE '[TEST]%'
 );
DELETE FROM public.bookings
 WHERE notes LIKE '[TEST]%';
DELETE FROM public.listings
 WHERE title LIKE '[TEST]%';
DELETE FROM public.providers
 WHERE business_name LIKE '[TEST]%';

-- ── 4. Providers (5 — varied categories, cities, tiers; 4 approved, 1 pending)
-- provider ids are captured into a temp table for the inserts below.
CREATE TEMP TABLE seed_providers (slot int PRIMARY KEY, id uuid NOT NULL);

WITH ins AS (
  INSERT INTO public.providers
    (user_id, business_name, category, description, country, city,
     phone, whatsapp, languages, status, subscription_tier,
     agreement_version, agreement_accepted_at)
  VALUES
    (:'tp1'::uuid, '[TEST] Maple Clean Co', 'cleaning',
     '[TEST] Dummy cleaning business for QA. Not a real business.',
     'CA', 'Calgary', '+1 555-0101', '+1 555-0101', '{en}',
     'approved', 'starter', '2026-10-11-v3', now()),
    (:'tp2'::uuid, '[TEST] Bright Spark Electric', 'electrical',
     '[TEST] Dummy electrical business for QA. Not a real business.',
     'CA', 'Edmonton', '+1 555-0102', NULL, '{en}',
     'approved', 'pro', '2026-10-11-v3', now()),
    (:'tp3'::uuid, '[TEST] Lolo Moving Helpers', 'moving',
     '[TEST] Dummy moving business for QA. Not a real business.',
     'CA', 'Vancouver', '+1 555-0103', '+1 555-0103', '{en,tl}',
     'approved', 'starter', '2026-10-11-v3', now()),
    (:'tp4'::uuid, '[TEST] Pixel Web Studio', 'tech',
     '[TEST] Dummy web-dev business for QA. Not a real business.',
     'US', 'Austin', '+1 555-0104', NULL, '{en,es}',
     'approved', 'business', '2026-10-11-v3', now()),
    (:'tp5'::uuid, '[TEST] Pending Plumbing Pros', 'plumbing',
     '[TEST] Dummy plumbing business for QA — intentionally left PENDING to exercise the admin approval queue.',
     'CA', 'Winnipeg', '+1 555-0105', NULL, '{en,fr}',
     'pending', 'starter', '2026-10-11-v3', now())
  RETURNING id
)
INSERT INTO seed_providers (slot, id)
SELECT row_number() OVER (), id FROM ins;

-- ── 5. Listings (10 — 2 per provider; fixed, hourly, and quote pricing) ──────
CREATE TEMP TABLE seed_listings (slot int PRIMARY KEY, id uuid NOT NULL);

WITH ins AS (
  INSERT INTO public.listings
    (provider_id, title, description, category, price_cents, price_type,
     country, city, status)
  VALUES
    -- P1: cleaning (Calgary)
    ((SELECT id FROM seed_providers WHERE slot = 1),
     '[TEST] Standard Home Cleaning', '[TEST] Dummy listing for QA.',
     'cleaning', 2500, 'fixed', 'CA', 'Calgary', 'active'),
    ((SELECT id FROM seed_providers WHERE slot = 1),
     '[TEST] Deep Clean (Hourly)', '[TEST] Dummy listing for QA.',
     'cleaning', 3500, 'hourly', 'CA', 'Calgary', 'active'),
    -- P2: electrical (Edmonton)
    ((SELECT id FROM seed_providers WHERE slot = 2),
     '[TEST] Outlet & Switch Install', '[TEST] Dummy listing for QA.',
     'electrical', 8500, 'fixed', 'CA', 'Edmonton', 'active'),
    ((SELECT id FROM seed_providers WHERE slot = 2),
     '[TEST] Troubleshooting (Hourly)', '[TEST] Dummy listing for QA.',
     'electrical', 9500, 'hourly', 'CA', 'Edmonton', 'paused'),
    -- P3: moving (Vancouver)
    ((SELECT id FROM seed_providers WHERE slot = 3),
     '[TEST] 2-Mover Local Move', '[TEST] Dummy listing for QA.',
     'moving', 12000, 'fixed', 'CA', 'Vancouver', 'active'),
    ((SELECT id FROM seed_providers WHERE slot = 3),
     '[TEST] Custom Moving Quote', '[TEST] Dummy listing for QA — price on request.',
     'moving', NULL, 'quote', 'CA', 'Vancouver', 'active'),
    -- P4: tech (Austin, US)
    ((SELECT id FROM seed_providers WHERE slot = 4),
     '[TEST] Landing Page Build', '[TEST] Dummy listing for QA.',
     'tech', 50000, 'fixed', 'US', 'Austin', 'active'),
    ((SELECT id FROM seed_providers WHERE slot = 4),
     '[TEST] Hourly Dev Support', '[TEST] Dummy listing for QA.',
     'tech', 7500, 'hourly', 'US', 'Austin', 'active'),
    -- P5: plumbing (Winnipeg) — provider is pending, so listings stay draft
    ((SELECT id FROM seed_providers WHERE slot = 5),
     '[TEST] Faucet Replacement', '[TEST] Dummy listing for QA.',
     'plumbing', 9900, 'fixed', 'CA', 'Winnipeg', 'draft'),
    ((SELECT id FROM seed_providers WHERE slot = 5),
     '[TEST] Drain Cleaning Quote', '[TEST] Dummy listing for QA.',
     'plumbing', NULL, 'quote', 'CA', 'Winnipeg', 'draft')
  RETURNING id
)
INSERT INTO seed_listings (slot, id)
SELECT row_number() OVER (), id FROM ins;

-- ── 6. Bookings (7 — 5 completed for reviews + 1 pending + 1 cancelled) ──────
-- NOTE: 5 completed bookings are needed because reviews.booking_id is UNIQUE
-- (one review per booking). The 3 required statuses are all covered.
CREATE TEMP TABLE seed_bookings (slot int PRIMARY KEY, id uuid NOT NULL);

WITH ins AS (
  INSERT INTO public.bookings
    (listing_id, customer_id, provider_id, scheduled_at, status, notes)
  VALUES
    -- 5 completed (review targets)
    ((SELECT id FROM seed_listings WHERE slot = 1),
     :'tc1'::uuid, (SELECT id FROM seed_providers WHERE slot = 1),
     now() - interval '6 days', 'completed', '[TEST] Dummy booking for QA — completed.'),
    ((SELECT id FROM seed_listings WHERE slot = 3),
     :'tc2'::uuid, (SELECT id FROM seed_providers WHERE slot = 2),
     now() - interval '5 days', 'completed', '[TEST] Dummy booking for QA — completed.'),
    ((SELECT id FROM seed_listings WHERE slot = 5),
     :'tc1'::uuid, (SELECT id FROM seed_providers WHERE slot = 3),
     now() - interval '4 days', 'completed', '[TEST] Dummy booking for QA — completed.'),
    ((SELECT id FROM seed_listings WHERE slot = 7),
     :'tc2'::uuid, (SELECT id FROM seed_providers WHERE slot = 4),
     now() - interval '3 days', 'completed', '[TEST] Dummy booking for QA — completed.'),
    ((SELECT id FROM seed_listings WHERE slot = 2),
     :'tc1'::uuid, (SELECT id FROM seed_providers WHERE slot = 1),
     now() - interval '2 days', 'completed', '[TEST] Dummy booking for QA — completed.'),
    -- 1 pending (upcoming)
    ((SELECT id FROM seed_listings WHERE slot = 6),
     :'tc2'::uuid, (SELECT id FROM seed_providers WHERE slot = 3),
     now() + interval '2 days', 'pending', '[TEST] Dummy booking for QA — pending.'),
    -- 1 cancelled
    ((SELECT id FROM seed_listings WHERE slot = 8),
     :'tc1'::uuid, (SELECT id FROM seed_providers WHERE slot = 4),
     now() - interval '1 day', 'cancelled', '[TEST] Dummy booking for QA — cancelled by customer.')
  RETURNING id
)
INSERT INTO seed_bookings (slot, id)
SELECT row_number() OVER (), id FROM ins;

-- ── 7. Reviews (5 — ratings spread 5,4,5,3,2; trigger updates rating_avg) ────
-- The refresh_provider_rating trigger recomputes providers.rating_avg /
-- review_count automatically, so no manual rating math here.
INSERT INTO public.reviews (booking_id, reviewer_id, provider_id, rating, text)
VALUES
  ((SELECT id FROM seed_bookings WHERE slot = 1),
   :'tc1'::uuid, (SELECT id FROM seed_providers WHERE slot = 1),
   5, '[TEST] Dummy review for QA — excellent service, would book again.'),
  ((SELECT id FROM seed_bookings WHERE slot = 2),
   :'tc2'::uuid, (SELECT id FROM seed_providers WHERE slot = 2),
   4, '[TEST] Dummy review for QA — good work, arrived a bit late.'),
  ((SELECT id FROM seed_bookings WHERE slot = 3),
   :'tc1'::uuid, (SELECT id FROM seed_providers WHERE slot = 3),
   1, '[TEST] Dummy review for QA — terrible experience, would not book again.'),
  ((SELECT id FROM seed_bookings WHERE slot = 4),
   :'tc2'::uuid, (SELECT id FROM seed_providers WHERE slot = 4),
   3, '[TEST] Dummy review for QA — okay result, communication could improve.'),
  ((SELECT id FROM seed_bookings WHERE slot = 5),
   :'tc1'::uuid, (SELECT id FROM seed_providers WHERE slot = 1),
   2, '[TEST] Dummy review for QA — below expectations, missed spots.');

COMMIT;

-- ── 8. Verification: what got seeded ─────────────────────────────────────────
SELECT 'providers' AS tbl, count(*) FROM public.providers WHERE business_name LIKE '[TEST]%'
UNION ALL
SELECT 'listings', count(*) FROM public.listings WHERE title LIKE '[TEST]%'
UNION ALL
SELECT 'bookings', count(*) FROM public.bookings WHERE notes LIKE '[TEST]%'
UNION ALL
SELECT 'reviews', count(*) FROM public.reviews WHERE text LIKE '[TEST]%';

-- Expected: providers 5 | listings 10 | bookings 7 | reviews 5
-- Spot-check the computed ratings (trigger-maintained):
SELECT business_name, status, rating_avg, review_count
FROM public.providers
WHERE business_name LIKE '[TEST]%'
ORDER BY business_name;
