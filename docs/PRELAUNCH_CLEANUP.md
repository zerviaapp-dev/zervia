# Zervia Pre-Launch Cleanup Checklist

> **Purpose:** Strip ALL dummy/test content before public launch. Test data in
> production destroys trust — a customer who sees "[TEST] Maple Clean Co" in
> search results will never come back. Run this checklist in full, get Liz's
> sign-off, and only then open the doors.

**Related:** `../scripts/seed-test-data.sql` (the seed script this cleans up after).

---

## 1. Dummy-Data Naming Conventions (how test data is marked)

All seeded test data follows these conventions so it can be found mechanically:

| Marker | Where it appears | Example |
|---|---|---|
| `[TEST]` prefix | `providers.business_name`, `listings.title`, `reviews.text`, `bookings.notes` | `[TEST] Maple Clean Co` |
| `555-01XX` phones | `providers.phone`, `providers.whatsapp` | `+1 555-0101` |
| `test` / `+test` emails | `auth.users.email` (test accounts) | `zerviaapp+provider@gmail.com` |
| `example.com` | Any email column, if ever used | `qa@example.com` |

**Rule:** never seed dummy data without a `[TEST]` marker. Unmarked test data is
invisible to the cleanup queries below.

---

## 2. Database — Detection Queries

Run these in the Supabase SQL Editor (service_role). Any row returned is test
data that must go before launch.

```sql
-- Providers
SELECT id, business_name, status, created_at
FROM public.providers
WHERE business_name LIKE '[TEST]%'
   OR phone LIKE '%555-01%';

-- Listings
SELECT id, title, status, created_at
FROM public.listings
WHERE title LIKE '[TEST]%';

-- Bookings
SELECT id, status, notes, created_at
FROM public.bookings
WHERE notes LIKE '[TEST]%';

-- Reviews
SELECT id, rating, left(text, 60) AS text_preview, created_at
FROM public.reviews
WHERE text LIKE '[TEST]%';

-- Escrow payments tied to test bookings
SELECT e.id, e.status, e.amount_cents
FROM public.escrow_payments e
JOIN public.bookings b ON b.id = e.booking_id
WHERE b.notes LIKE '[TEST]%';

-- Payouts tied to test providers/bookings
SELECT p.id, p.status, p.amount_cents
FROM public.payouts p
LEFT JOIN public.providers pr ON pr.id = p.provider_id
LEFT JOIN public.bookings b ON b.id = p.booking_id
WHERE pr.business_name LIKE '[TEST]%'
   OR b.notes LIKE '[TEST]%';

-- Guarantee claims tied to test bookings
SELECT g.id, g.status
FROM public.guarantee_claims g
JOIN public.bookings b ON b.id = g.booking_id
WHERE b.notes LIKE '[TEST]%';

-- Profiles used only for testing (full_name marker — only if you marked them)
SELECT id, full_name, country
FROM public.profiles
WHERE full_name LIKE '[TEST]%';
```

### Look up test user UUIDs (for the seed script's \set block)

```sql
SELECT id, email, created_at
FROM auth.users
WHERE email ILIKE '%test%'
   OR email ILIKE 'zerviaapp+%@gmail.com'
ORDER BY created_at;
```

---

## 3. Database — Deletion Queries

Run in this order (child tables first — respects foreign keys). Wrap in a
transaction and verify with the detection queries before committing.

```sql
BEGIN;

-- 1. Reviews
DELETE FROM public.reviews WHERE text LIKE '[TEST]%';

-- 2. Guarantee claims on test bookings
DELETE FROM public.guarantee_claims
WHERE booking_id IN (SELECT id FROM public.bookings WHERE notes LIKE '[TEST]%');

-- 3. Payouts on test providers/bookings
DELETE FROM public.payouts
WHERE provider_id IN (SELECT id FROM public.providers WHERE business_name LIKE '[TEST]%')
   OR booking_id IN (SELECT id FROM public.bookings WHERE notes LIKE '[TEST]%');

-- 4. Escrow payments on test bookings
DELETE FROM public.escrow_payments
WHERE booking_id IN (SELECT id FROM public.bookings WHERE notes LIKE '[TEST]%');

-- 5. Bookings
DELETE FROM public.bookings WHERE notes LIKE '[TEST]%';

-- 6. Listings
DELETE FROM public.listings WHERE title LIKE '[TEST]%';

-- 7. Providers
DELETE FROM public.providers WHERE business_name LIKE '[TEST]%';

-- 8. Test-only profiles (ONLY rows you marked [TEST] — never delete real users)
DELETE FROM public.profiles WHERE full_name LIKE '[TEST]%';

-- Verify zero rows remain, then:
COMMIT;
-- (If anything looks wrong: ROLLBACK; instead.)
```

> **Test auth accounts** (`auth.users` rows like `zerviaapp+provider@gmail.com`)
> are deleted from **Authentication > Users** in the Supabase dashboard
> (deleting the auth user cascades to `public.profiles` via FK). Do this AFTER
> the SQL above.

---

## 4. Stripe — Test Mode Data

- [ ] Confirm `STRIPE_SECRET_KEY` in Vercel **Production** starts with `sk_live_`
      (test keys start with `sk_test_` — the app's `isStripeTestMode()` helper
      keys all user-facing labels off this).
- [ ] Stripe Dashboard: switch from **Test mode** to **Live mode** toggle and
      confirm zero live payments exist yet.
- [ ] Delete/ignore test-mode Customers, PaymentIntents, and Transfers — they
      live in Stripe's sandbox only and never touch live mode, but confirm the
      toggle is on Live before announcing launch.
- [ ] Rotate `STRIPE_WEBHOOK_SECRET` if it was ever pasted into chat
      (it was, Oct 11 2026 — rotate after testing ends).

---

## 5. Code & Config — Pre-Launch Sweep

- [ ] `DISABLE_TURNSTILE` — remove the env var from Vercel Production
      (temporary test bypass; bot protection must be live at launch).
      Code reference: `lib/turnstile.ts`.
- [x] Search the codebase for leftovers:
      `grep -rniE "lorem ipsum|\[TEST\]|555-01|example\.com" lib components app`
      — expect zero hits outside `scripts/seed-test-data.sql` and this doc.
      ✅ **DONE Oct 11, 2026** — Zero hits. Clean.
- [x] Confirm no `console.log` with test data or secrets in server actions.
      ✅ **DONE Oct 11, 2026** — 2 instances found (escrow-actions.ts, tiktok-actions.ts),
      both log only internal IDs for operational debugging. No PII, secrets, or test data.
- [ ] Confirm `isStripeTestMode()`-gated labels show the live wording when
      `STRIPE_SECRET_KEY=sk_live_...` (spot-check a booking page).
- [ ] Static FX rates in `lib/currency.ts` — replace with a live feed before
      real non-CAD money moves (code warns inline).

---

## 6. Storage & Media

- [ ] Supabase Storage buckets (`listing-photos`, `id-documents`, avatars):
      list and delete any `test-*` / `[TEST]`-named objects.
- [ ] Placeholder images shipped in `public/` that were only for QA
      (cross-check against the cover-image provenance list).

---

## 7. Verification — Prove the Cleanup

After deletions, re-run **every** detection query in §2. Expected result:
**zero rows everywhere.** Then:

```sql
-- Sanity: no test-marked rows anywhere in the core tables
SELECT 'providers' t, count(*) FROM public.providers WHERE business_name LIKE '[TEST]%'
UNION ALL SELECT 'listings', count(*) FROM public.listings WHERE title LIKE '[TEST]%'
UNION ALL SELECT 'bookings', count(*) FROM public.bookings WHERE notes LIKE '[TEST]%'
UNION ALL SELECT 'reviews',  count(*) FROM public.reviews  WHERE text LIKE '[TEST]%';
-- All counts must be 0.
```

- [ ] Public marketplace search shows no `[TEST]` listings.
- [ ] Admin approval queue shows no `[TEST]` providers.
- [ ] No test accounts can still sign in.

---

## 8. Dummy-Testing Approach (reference)

**When to use dummy data vs real data:**
- Dummy data: all QA, usability walkthroughs, load/stress checks, screenshots
  for internal review. Always `[TEST]`-marked, always in the sandbox/Stripe test mode.
- Real data: never for testing. No real customer PII, no real payments, no
  production listings used as guinea pigs.

**Stripe test cards** (sandbox only — never real cards in testing):
| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0000 0000 3220` | 3-D Secure required |
Any future expiry date, any CVC.

**Test doubles (code-level):** unit tests should stub external calls (Stripe,
Supabase) rather than hitting them; the seed script covers integration-level
dummy data. Keep the two layers separate — seed data is for the running app,
mocks are for automated tests.

---

## 9. Sign-Off

| Check | Owner | Done |
|---|---|---|
| §2 detection queries return zero rows |  | ☐ |
| §3 deletions committed & verified |  | ☐ |
| Test auth accounts deleted |  | ☐ |
| Stripe on live keys, test mode off |  | ☐ |
| Webhook secret rotated |  | ☐ |
| `DISABLE_TURNSTILE` removed from Production |  | ☐ |
| `test_bypass_id` ID-upload bypass removed from onboarding code | Lizzie | ☐ |
| Code sweep (§5) clean | Lizzie | ✅ Oct 11 |
| Storage/media sweep (§6) clean |  | ☐ |
| Marketplace & admin queue spot-checked |  | ☐ |

**CEO sign-off:** ______________________ **Date:** __________

*Do not launch until every box is checked and signed.*
