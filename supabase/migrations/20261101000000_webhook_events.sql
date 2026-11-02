-- ============================================================================
-- Durable Stripe webhook event ledger — REVISED Nov 1, 2026 (~07:30 MST).
-- Repair branch: lizzie/zervia-repair-2026-11-01 (from main@40647a81).
--
-- Revisions vs the Oct 31 overtime version, per independent review
-- #6555289723 (2am HOLD) and #6557697448 (morning review):
--   * webhook_effects.status gains 'ambiguous' (external call started,
--     outcome unknown after dispatch — never auto re-executed).
--   * Effect ownership/fencing: owner_token (the event lease token) on
--     every effect; done/failed/ambiguous transitions are compare-and-set
--     on (effect_key, owner_token) so a stale worker cannot land a write
--     over the redrive worker.
--   * failure_kind ('not_sent' | 'unknown') records the definitely-sent
--     vs unknown-after-dispatch distinction.
--   * idempotency_key / correlation_id: the stable provider
--     idempotency/correlation identity, persisted BEFORE the external
--     call executes.
--   * transactions.effect_key: UNIQUE business-effect key
--     (provider + environment + merchant scope + effect type + provider
--     effect id). Refunds stay distinct from captures via the effect
--     type. Provider webhook event id is stored separately as
--     stripe_event_id (receipt correlation, NOT uniqueness).
--   * Legacy backfill: legacy=true AND legacy_outcome_unknown=true —
--     backfilling as completed avoids blind redrive but does NOT
--     establish historical success (per the 2am review). The
--     webhook_legacy_reconciliation view produces the counts.
--   * webhook_manual_review_queue: the DURABLE VISIBLE operator queue
--     for ambiguous effects + failed non-retryable events (200
--     manualReview is not log-only triage).
--
-- STATUS: UNAPPLIED. SHIPPED FOR SEPARATE REVIEW ONLY. NO production
-- migration is authorized. Apply staging/test-first and prove the
-- event-sourced retry there before any production step. This migration
-- is forward-compatible: additive columns/defaults only, no destructive
-- rollback assumptions (downgrade = stop writing new columns; old code
-- ignores them).
-- ============================================================================

-- Single event ledger. stripe_events remains in the database as untouched
-- history; the application writes ONLY to webhook_events after this
-- migration (no second disconnected ledger).
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id        text PRIMARY KEY,
  event_type      text NOT NULL,
  state           text NOT NULL DEFAULT 'received'
                  CHECK (state IN ('received','claimed','processing','completed','failed')),
  lease_token     text,
  lease_expires_at timestamptz,
  attempts        integer NOT NULL DEFAULT 0,
  retryable       boolean NOT NULL DEFAULT true,
  next_attempt_at timestamptz,
  worker_id       text,
  claimed_at      timestamptz,
  completed_at    timestamptz,
  last_error      text,
  -- Backfilled rows from stripe_events (unknown historical outcomes).
  legacy          boolean NOT NULL DEFAULT false,
  -- Per the 2am review: a backfilled completed row is NOT proof of
  -- historical success. Reconciliation counts come from
  -- webhook_legacy_reconciliation; unknown history is investigated
  -- explicitly, never assumed.
  legacy_outcome_unknown boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Outbox / effect ledger for external fulfillment. One row per
-- (event, external effect); the effect key is the idempotency key.
CREATE TABLE IF NOT EXISTS webhook_effects (
  effect_key   text PRIMARY KEY,
  event_id     text NOT NULL REFERENCES webhook_events(event_id),
  effect_name  text NOT NULL,
  status       text NOT NULL DEFAULT 'started'
               CHECK (status IN ('started','completed','failed','ambiguous')),
  external_id  text,
  -- Lease token of the worker that owns this effect (fencing). All
  -- transitions below are compare-and-set on (effect_key, owner_token).
  owner_token  text,
  -- 'not_sent' = rejected before dispatch (safe to retry);
  -- 'unknown'  = outcome unknown after dispatch (never auto re-executed).
  failure_kind text CHECK (failure_kind IN ('not_sent','unknown')),
  -- Stable provider idempotency/correlation identity, persisted BEFORE
  -- the external call executes (e.g. CJ order remark).
  idempotency_key text,
  correlation_id  text,
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Duplicate-safe ledger: one row per business effect. The provider
-- webhook event id is receipt correlation only (stripe_event_id).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS effect_key text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_effect_key_uidx
  ON transactions (effect_key) WHERE effect_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_events_redrive_idx
  ON webhook_events (state, next_attempt_at)
  WHERE state = 'failed';
CREATE INDEX IF NOT EXISTS webhook_events_lease_idx
  ON webhook_events (lease_expires_at)
  WHERE state IN ('claimed','processing');
CREATE INDEX IF NOT EXISTS webhook_effects_event_idx
  ON webhook_effects (event_id);
CREATE INDEX IF NOT EXISTS webhook_effects_status_idx
  ON webhook_effects (status) WHERE status IN ('started','ambiguous');

-- ----------------------------------------------------------------------------
-- RPC: idempotent register. Inserts 'received' (unleased) or returns the
-- existing row. Never touches a completed row's state.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_register(p_event_id text, p_event_type text)
RETURNS TABLE (
  event_id text, event_type text, state text,
  lease_token text, lease_expires_at timestamptz,
  attempts integer, retryable boolean, next_attempt_at timestamptz,
  last_error text, legacy boolean, legacy_outcome_unknown boolean
) LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO webhook_events (event_id, event_type, state)
  VALUES (p_event_id, p_event_type, 'received')
  ON CONFLICT (event_id) DO NOTHING;
  SELECT e.event_id, e.event_type, e.state,
         e.lease_token, e.lease_expires_at,
         e.attempts, e.retryable, e.next_attempt_at,
         e.last_error, e.legacy, e.legacy_outcome_unknown
  FROM webhook_events e
  WHERE e.event_id = p_event_id;
$$;

-- ----------------------------------------------------------------------------
-- RPC: atomic claim. Exactly one concurrent caller wins: the UPDATE takes
-- the row lock, and the second caller re-evaluates eligibility against the
-- locked (already-claimed) row and matches zero rows. (Unchanged.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_claim(
  p_event_id text, p_lease_token text, p_lease_ms integer, p_worker_id text
) RETURNS TABLE (claimed boolean, prev_state text, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prev_state text;
  v_prev_attempts integer;
BEGIN
  SELECT e.state, e.attempts INTO v_prev_state, v_prev_attempts
  FROM webhook_events e WHERE e.event_id = p_event_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, 0;
    RETURN;
  END IF;

  UPDATE webhook_events e
  SET state            = 'claimed',
      lease_token      = p_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_ms / 1000.0),
      attempts         = e.attempts + 1,
      claimed_at       = now(),
      worker_id        = p_worker_id,
      updated_at       = now()
  WHERE e.event_id = p_event_id
    AND e.state <> 'completed'
    AND (
      e.state = 'received'
      OR (e.state = 'failed' AND e.retryable AND e.next_attempt_at <= now())
      OR (e.state IN ('claimed','processing') AND e.lease_expires_at < now())
    );

  IF FOUND THEN
    RETURN QUERY SELECT true, v_prev_state, v_prev_attempts + 1;
  ELSE
    RETURN QUERY SELECT false, v_prev_state, v_prev_attempts;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: claimed -> processing, compare-and-set on the lease token. (Unchanged.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_begin_processing(
  p_event_id text, p_lease_token text
) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE webhook_events
  SET state = 'processing', updated_at = now()
  WHERE event_id = p_event_id
    AND lease_token = p_lease_token
    AND state = 'claimed'
  RETURNING true;
$$;

-- ----------------------------------------------------------------------------
-- RPC: processing -> completed, compare-and-set on the lease token.
-- (Unchanged.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_complete(
  p_event_id text, p_lease_token text
) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE webhook_events
  SET state = 'completed',
      completed_at = now(),
      lease_token = NULL,
      updated_at = now()
  WHERE event_id = p_event_id
    AND lease_token = p_lease_token
    AND state = 'processing'
  RETURNING true;
$$;

-- ----------------------------------------------------------------------------
-- RPC: processing -> failed (CAS on lease token), with retry scheduling.
-- Non-retryable failures stay failed forever: manual review only.
-- (Unchanged.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_fail(
  p_event_id text, p_lease_token text, p_retryable boolean, p_error text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_attempts integer;
BEGIN
  SELECT attempts INTO v_attempts FROM webhook_events
  WHERE event_id = p_event_id;

  UPDATE webhook_events
  SET state           = 'failed',
      lease_token     = NULL,
      retryable       = p_retryable,
      next_attempt_at = CASE WHEN p_retryable
                             THEN now() + make_interval(
                               secs => LEAST(30 * pow(2, GREATEST(v_attempts - 1, 0)), 3600))
                             ELSE NULL END,
      last_error      = left(p_error, 500),
      updated_at      = now()
  WHERE event_id = p_event_id
    AND lease_token = p_lease_token
    AND state = 'processing';

  RETURN FOUND;
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: extend a live lease (CAS on lease token). (Unchanged.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_renew_lease(
  p_event_id text, p_lease_token text, p_lease_ms integer
) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE webhook_events
  SET lease_expires_at = now() + make_interval(secs => p_lease_ms / 1000.0),
      updated_at = now()
  WHERE event_id = p_event_id
    AND lease_token = p_lease_token
    AND state IN ('claimed','processing')
    AND lease_expires_at > now()
  RETURNING true;
$$;

-- ----------------------------------------------------------------------------
-- RPC: record dispatch intent (atomic insert-if-absent). Returns
-- started=true iff THIS worker created the row and owns it. A concurrent
-- worker that loses the race gets started=false and must re-read the row
-- — never overwrite another worker's effect.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_effect_start(
  p_effect_key text, p_event_id text, p_effect_name text,
  p_owner_token text, p_idempotency_key text, p_correlation_id text
) RETURNS TABLE (started boolean) LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO webhook_effects
    (effect_key, event_id, effect_name, status, owner_token,
     idempotency_key, correlation_id, attempts)
  VALUES (p_effect_key, p_event_id, p_effect_name, 'started', p_owner_token,
          p_idempotency_key, p_correlation_id, 1)
  ON CONFLICT (effect_key) DO NOTHING
  RETURNING true;
$$;

-- ----------------------------------------------------------------------------
-- RPC: effect -> completed, compare-and-set on (effect_key, owner_token).
-- A stale worker's write matches zero rows (updated=false).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_effect_done(
  p_effect_key text, p_external_id text, p_owner_token text
) RETURNS TABLE (updated boolean) LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE webhook_effects
  SET status = 'completed',
      external_id = p_external_id,
      updated_at = now()
  WHERE effect_key = p_effect_key
    AND owner_token = p_owner_token
    AND status IN ('started','failed')
  RETURNING true;
$$;

-- ----------------------------------------------------------------------------
-- RPC: effect -> failed with the failure kind, CAS on owner token.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_effect_failed(
  p_effect_key text, p_error text, p_owner_token text, p_failure_kind text
) RETURNS TABLE (updated boolean) LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE webhook_effects
  SET status = 'failed',
      failure_kind = p_failure_kind,
      last_error = left(p_error, 500),
      attempts = attempts + 1,
      updated_at = now()
  WHERE effect_key = p_effect_key
    AND owner_token = p_owner_token
    AND status IN ('started','failed')
  RETURNING true;
$$;

-- ----------------------------------------------------------------------------
-- RPC: effect -> ambiguous (outcome unknown after dispatch), CAS on owner
-- token. This is the durable record the operator reconciles against the
-- provider dashboard; the effect is never auto re-executed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION webhook_effect_ambiguous(
  p_effect_key text, p_error text, p_owner_token text
) RETURNS TABLE (updated boolean) LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE webhook_effects
  SET status = 'ambiguous',
      failure_kind = 'unknown',
      last_error = left(p_error, 500),
      attempts = attempts + 1,
      updated_at = now()
  WHERE effect_key = p_effect_key
    AND owner_token = p_owner_token
    AND status IN ('started','failed')
  RETURNING true;
$$;

-- ----------------------------------------------------------------------------
-- VIEW: durable manual-review queue. This is what the route's 200
-- manualReview points at — a visible operator queue, not log-only
-- triage. Ambiguous effects carry the idempotency/correlation identity
-- the operator uses to reconcile against the provider dashboard, then
-- marks the effect completed/failed explicitly.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW webhook_manual_review_queue AS
SELECT
  e.event_id,
  e.event_type,
  e.state            AS event_state,
  e.retryable,
  e.last_error       AS event_error,
  f.effect_key,
  f.effect_name,
  f.status           AS effect_status,
  f.external_id,
  f.idempotency_key,
  f.correlation_id,
  f.last_error       AS effect_error,
  f.updated_at
FROM webhook_events e
LEFT JOIN webhook_effects f ON f.event_id = e.event_id
WHERE (e.state = 'failed' AND e.retryable = false)
   OR f.status = 'ambiguous'
ORDER BY f.updated_at DESC NULLS LAST, e.updated_at DESC;

-- ----------------------------------------------------------------------------
-- VIEW: legacy reconciliation counts. Backfilled rows are completed with
-- legacy_outcome_unknown=true: dedupe is preserved and nothing is
-- redriven, but historical success is NOT claimed. Unknown history must
-- be investigated explicitly (against the ledger + provider events),
-- never assumed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW webhook_legacy_reconciliation AS
SELECT
  count(*) FILTER (WHERE legacy AND legacy_outcome_unknown) AS legacy_unknown,
  count(*) FILTER (WHERE legacy AND NOT legacy_outcome_unknown) AS legacy_verified,
  count(*) FILTER (WHERE NOT legacy) AS durable_events
FROM webhook_events;

-- ----------------------------------------------------------------------------
-- SAFE BACKFILL from the legacy stripe_events ledger (REVISED per the 2am
-- review): one historical row -> one webhook_events row as terminal
-- 'completed' with legacy=true AND legacy_outcome_unknown=true.
-- Historical stripe_events rows were claim-markers with UNKNOWN outcomes
-- (the old code never recorded completion); redriving them risks
-- double-fulfillment. stripe_events itself is left untouched as
-- read-only history.
-- ----------------------------------------------------------------------------
INSERT INTO webhook_events
  (event_id, event_type, state, legacy, legacy_outcome_unknown, attempts, completed_at)
SELECT event_id, event_type, 'completed', true, true, 1, now()
FROM stripe_events
ON CONFLICT (event_id) DO NOTHING;
