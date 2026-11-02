-- ============================================================================
-- PayPal capture durable completion states — Nov 2, 2026 (REV 2).
-- Repair branch: lizzie/zervia-repair-2026-11-01.
--
-- Confirmed defect (Nov 2): app/api/paypal/capture/route.ts called the
-- PayPal capture API even on a duplicate idempotency claim — the code
-- comment said "never re-capture" but the wiring captured first and only
-- skipped fulfillment. The route now runs a durable status machine on
-- paypal_orders (lib/billing/capture-idempotency.ts):
--
--   claimed → capturing → captured → recovering → fulfilled
--                 └→ failed (terminal: operator reconciles)
--
-- REV 2 (GPT safety review, Nov 2): the REV 1 single-statement
-- `ADD COLUMN ... NOT NULL DEFAULT` form was rejected — on an existing
-- table it backfills under an ACCESS EXCLUSIVE lock. This revision uses
-- the safe sequence instead: (1) add columns NULLABLE with no default
-- (metadata-only, no rewrite); (2) backfill existing rows in a plain
-- UPDATE (the table is tiny — PayPal billing is not live yet, so this
-- is a handful of rows at most); (3) set defaults + NOT NULL only after
-- the backfill; (4) CHECK constraint + index last. Every step is
-- idempotent — the migration is safe to re-run.
--
-- BULK-FIX AMENDMENT (Nov 2, cold-verification hardening): the status
-- machine gains the terminal 'failed' state + a `last_error` column
-- (capture threw / incomplete, amount mismatch, fulfill threw).
-- Duplicates on a failed row get the failure page — never a re-capture
-- and never a false success; the operator reconciles via status +
-- capture_id + last_error and the PayPal dashboard. `last_error` is
-- nullable with no default (Step 1 only) — no backfill needed.
--
-- INDEPENDENT-REVIEW AMENDMENT (Nov 2, OpenAI defect-hunting review):
-- (a) the 'recovering' state — fulfillment ownership. Exactly one
-- worker holds the atomic captured→recovering compare-and-set and runs
-- fulfill(); this closes the double-fulfill race where two concurrent
-- recovery workers both passed the ledger guard and both fulfilled.
-- (b) unique index on transactions(paypal_order_id) — defense-in-depth
-- for the one-order/one-ledger-row invariant (the ledger guard is the
-- primary exactly-once mechanism; the index makes a double-insert
-- structurally impossible). Safe: PayPal billing was never live, so no
-- existing rows can violate it.
--
-- STATUS: UNAPPLIED. SHIPPED FOR SEPARATE REVIEW ONLY. Applying this
-- migration needs the owner's named migration GO — do NOT apply it
-- without that explicit approval.
-- ============================================================================

-- The table may already exist (created ad-hoc with paypal_order_id,
-- kind, provider_id). Create it fully when absent; add the new columns
-- when present.
CREATE TABLE IF NOT EXISTS paypal_orders (
  paypal_order_id text PRIMARY KEY,
  kind            text,
  provider_id     text,
  status          text NOT NULL DEFAULT 'claimed',
  capture_id      text,
  last_error      text,
  captured_at     timestamptz,
  fulfilled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Step 1: nullable adds only — metadata-only, no table rewrite.
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS kind         text;
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS provider_id  text;
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS status       text;
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS capture_id   text;
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS last_error   text;
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS captured_at  timestamptz;
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS created_at   timestamptz;
ALTER TABLE paypal_orders ADD COLUMN IF NOT EXISTS updated_at   timestamptz;

-- Step 2: backfill pre-migration rows. Rows claimed before this
-- migration existed start life as 'claimed': the first duplicate return
-- replays the status machine from there and converges to the true state.
UPDATE paypal_orders SET status = 'claimed'     WHERE status IS NULL;
UPDATE paypal_orders SET created_at = now()     WHERE created_at IS NULL;
UPDATE paypal_orders SET updated_at = now()     WHERE updated_at IS NULL;

-- Step 3: defaults + NOT NULL only after the backfill — no row can
-- violate the constraints at this point.
ALTER TABLE paypal_orders ALTER COLUMN status     SET DEFAULT 'claimed';
ALTER TABLE paypal_orders ALTER COLUMN status     SET NOT NULL;
ALTER TABLE paypal_orders ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE paypal_orders ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE paypal_orders ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE paypal_orders ALTER COLUMN updated_at SET NOT NULL;

-- Step 4: state-machine guard + lookup index (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paypal_orders_status_check'
  ) THEN
    ALTER TABLE paypal_orders ADD CONSTRAINT paypal_orders_status_check
      CHECK (status IN ('claimed', 'capturing', 'captured', 'recovering', 'fulfilled', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS paypal_orders_status_idx
  ON paypal_orders (status);

-- One-order/one-ledger-row: the transactions ledger guard is the primary
-- exactly-once mechanism; this unique index makes a double ledger insert
-- structurally impossible (defense in depth, independent-review
-- amendment). Partial index: only rows that carry a PayPal order id.
DO $$
BEGIN
  IF to_regclass('public.transactions') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS transactions_paypal_order_uidx
      ON transactions (paypal_order_id)
      WHERE paypal_order_id IS NOT NULL;
  END IF;
END
$$;

COMMENT ON COLUMN paypal_orders.last_error IS
  'Terminal failure reason (capture_failed, capture_incomplete, amount_mismatch, fulfill_failed, ledger_unreadable, migration_required, capture_mark_failed). Set when status goes to failed.';
