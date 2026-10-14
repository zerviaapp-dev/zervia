# Zervia Live Simulation Guide

> **Simulate a live marketplace with realistic dummy data.**
> For QA, usability walkthroughs, dashboard testing, and demo walkthroughs.

## What is this?

`simulate-live.sql` seeds a **full-lifecycle dummy marketplace** into your database:

| Table | Rows | Coverage |
|---|---|---|
| providers | 8 | cleaning, electrical, moving, tech, landscaping, handyman, plumbing (pending), roofing (rejected) |
| listings | 16 | fixed / hourly / quote pricing; active / paused / draft |
| bookings | 16 | **every status**: 8 completed, 2 confirmed, 2 in_progress, 2 pending, 1 cancelled, 1 disputed |
| reviews | 8 | ratings 1–5 spread (5,4,5,3,2,1,4,5) |
| escrow_payments | 15 | held / released / refunded / disputed |
| payouts | 8 | paid / pending / processing (10% starter fee, 5% pro/business fee) |
| guarantee_claims | 1 | pending claim on a completed booking |

This exercises the **entire money lifecycle**: discovery → booking → payment → escrow hold → completion → release → payout → review → dispute → refund → guarantee claim.

## How to run

### Prerequisites
- A Supabase project (staging/dev — **NEVER production with real users**)
- 11 test auth accounts created via the app's normal signup:
  - 8 providers: e.g. `zerviaapp+sim1@gmail.com` … `zerviaapp+sim8@gmail.com`
  - 3 customers: e.g. `zerviaapp+cust1@gmail.com` … `zerviaapp+cust3@gmail.com`

### Steps
1. In Supabase Dashboard → **Authentication → Users**, copy each test account's UUID.
   (Or run this in the SQL Editor to list them:)
   ```sql
   SELECT id, email FROM auth.users
   WHERE email ILIKE 'zerviaapp+sim%@gmail.com'
      OR email ILIKE 'zerviaapp+cust%@gmail.com'
   ORDER BY email;
   ```
2. Open `simulate-live.sql`, paste the 11 UUIDs into the `\set` block at the top
   (replacing `REPLACE-WITH-…-UUID` — do NOT wrap in quotes).
3. Run the **entire script** in the Supabase SQL Editor as service_role.
4. The script validates your UUIDs first and fails with a friendly error if
   any are missing or don't have a `public.profiles` row.
5. At the end it prints verification counts — check they match the expected
   numbers in the output comments.

### Idempotency
The script **deletes all previous `[TEST]` rows before seeding** (in FK-safe
order), so re-running is safe — you'll always get a fresh, consistent dataset.

## What to test with this data

- **Discover page**: 13 active listings across 6 categories, varied prices
- **Trending Now**: completed bookings drive the ranking
- **Booking flow**: pick any active listing, book as a test customer
- **Provider dashboard**: sign in as a sim provider — see bookings, earnings, payouts
- **Admin approval queue**: 1 pending provider (`[TEST] Pending Plumbing Pros`)
- **Admin verification queue**: providers have `id_verified` flags set
- **Dispute resolution**: 1 disputed booking with a frozen escrow record
- **Guarantee claims**: 1 pending claim in the admin queue
- **Payout tracking**: 5 paid, 2 pending, 1 processing across providers
- **Reviews**: rating averages are trigger-maintained — check provider profiles

## Cleanup

**Before public launch, ALL simulation data must be deleted.**

See `docs/PRELAUNCH_CLEANUP.md` — it has:
- **§2** detection queries (prove what `[TEST]` rows exist)
- **§3** deletion queries (remove them in FK-safe order)
- **§7** verification queries (prove zero rows remain)
- **§9** the CEO sign-off checklist

Quick sanity check after cleanup:
```sql
SELECT 'providers' t, count(*) FROM public.providers WHERE business_name LIKE '[TEST]%'
UNION ALL SELECT 'listings', count(*) FROM public.listings WHERE title LIKE '[TEST]%'
UNION ALL SELECT 'bookings', count(*) FROM public.bookings WHERE notes LIKE '[TEST]%'
UNION ALL SELECT 'reviews',  count(*) FROM public.reviews  WHERE text LIKE '[TEST]%';
-- All counts must be 0.
```

Also delete the 11 test auth accounts from **Authentication → Users**
(deleting the auth user cascades to `public.profiles`).

## ⚠️ Warnings

- **NEVER run on production** with real users. Use a staging/dev project.
- **NEVER use real names, emails, or phone numbers.** All data uses `[TEST]`
  prefixes, `555-01XX` phones, and fake `pi_test_sim_XXX` Stripe IDs.
- **NEVER publish dummy data.** The `[TEST]` markers exist so cleanup is
  mechanical — unmarked test data is invisible to the cleanup queries.
- The fake Stripe IDs (`pi_test_sim_XXX`, `tr_test_sim_XXX`) never touch real
  Stripe — they're just realistic placeholders for the escrow/payout columns.

## Relationship to `seed-test-data.sql`

| | `seed-test-data.sql` | `simulate-live.sql` |
|---|---|---|
| Purpose | Minimal QA seed | Full lifecycle simulation |
| Providers | 5 | 8 (incl. pending + rejected) |
| Listings | 10 | 16 |
| Bookings | 7 (3 statuses) | 16 (all 6 statuses) |
| Reviews | 5 | 8 (ratings 1–5) |
| Escrow | none | 15 (all 4 statuses) |
| Payouts | none | 8 (all 3 active statuses) |
| Guarantee claims | none | 1 |
| Test users needed | 7 | 11 |

Use `seed-test-data.sql` for quick smoke tests; use `simulate-live.sql` when
you need the marketplace to *feel* alive — dashboards, admin queues, analytics,
and end-to-end lifecycle testing.
