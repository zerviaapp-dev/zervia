/**
 * Durable Stripe webhook event lifecycle — REPAIRED Nov 1, 2026 (~07:30 MST).
 *
 * Repair branch: `lizzie/zervia-repair-2026-11-01` (from main@40647a81).
 *
 * This revision answers the independent review's 2am HOLD (#6555289723) and
 * the Nov 1 morning review (#6557697448), which independently reproduced a
 * residual defect in the Oct 31 overtime build: a remote order accepted but
 * the response timing out was recorded `failed`/retryable, and the second
 * invocation RE-EXECUTED the external call (observed externalCalls=2) —
 * contradicting the design claim "ambiguous external outcomes are never
 * blindly repeated".
 *
 * Repairs in this revision:
 *
 * 1. DEFINITELY-NOT-SENT vs UNKNOWN-AFTER-DISPATCH. The external function
 *    must throw a typed error:
 *      - `ExternalNotSentError`   — rejected/validated before any dispatch
 *        (auth, 4xx, schema). Recorded `failed` with failure_kind='not_sent';
 *        safe to retry.
 *      - `ExternalUnknownOutcomeError` — timeout, reset, 5xx-with-unknown
 *        side effects: the remote side MAY have acted. Recorded `ambiguous`
 *        with failure_kind='unknown'; NEVER auto re-executed — the effect
 *        throws `AmbiguousEffectError` on every later invocation and the
 *        event fails non-retryable into the durable manual-review queue.
 *    Untyped errors from an external function default to UNKNOWN
 *    (conservative for money): repeating a charge/order the remote side
 *    already accepted is worse than a human reconciliation.
 * 2. EXTERNAL SUCCESS + recordEffectDone DB FAILURE is not a failed
 *    effect. The old catch called recordEffectFailed — downgrading a
 *    completed external effect to retryable-failed (the exact defect
 *    flagged). Now: `fn()` returning means the effect is DONE externally.
 *    recordEffectDone is retried (bounded); if the ledger write still
 *    fails, `EffectLedgerWriteError` is thrown — non-retryable, carrying
 *    the effect key + external id so the operator queue can reconcile
 *    (the provider dashboard shows the real outcome). Never `failed`,
 *    never auto re-executed.
 * 3. ATOMIC EFFECT OWNERSHIP / FENCING. recordEffectStart takes the
 *    current event lease token as `owner_token`; recordEffectDone /
 *    recordEffectFailed / recordEffectAmbiguous are compare-and-set on
 *    (effect_key, owner_token). A stale worker whose lease expired cannot
 *    complete or fail an effect owned by the redrive worker — the CAS
 *    misses and `EffectOwnershipError` is thrown. The event lease alone
 *    cannot stop a stale worker's external call; the effect owner token
 *    can stop its ledger write from landing over the replacement.
 * 4. LEDGER failures propagate (never silent console.error). Ledger
 *    idempotency lives in lib/billing/ledger.ts (business-effect-key
 *    uniqueness per the morning review: provider + environment +
 *    merchant scope + effect type + provider effect id).
 *
 * Migration 20261101000000_webhook_events.sql is REVISED for the new
 * columns/statuses and remains UNAPPLIED (separate review; no production
 * migration authorized).
 */

export type EventState =
  | 'received'
  | 'claimed'
  | 'processing'
  | 'completed'
  | 'failed';

/** 'ambiguous' = external call started, outcome unknown; reconciled by a
 *  human via the manual-review queue, never auto re-executed. */
export type EffectStatus = 'started' | 'completed' | 'failed' | 'ambiguous';

/** How the failure was classified at record time. */
export type EffectFailureKind = 'not_sent' | 'unknown';

export interface EventRow {
  event_id: string;
  event_type: string;
  state: EventState;
  lease_token: string | null;
  lease_expires_at: string | null; // ISO
  attempts: number;
  retryable: boolean;
  next_attempt_at: string | null; // ISO
  last_error: string | null;
  legacy: boolean;
  /** True when the legacy row's historical outcome was never proven. */
  legacy_outcome_unknown?: boolean;
}

export interface EffectRow {
  effect_key: string;
  event_id: string;
  effect_name: string;
  status: EffectStatus;
  external_id: string | null;
  attempts: number;
  last_error: string | null;
  /** Lease token of the worker that owns this effect (fencing). */
  owner_token: string | null;
  failure_kind: EffectFailureKind | null;
  /** Stable provider idempotency/correlation identity, persisted BEFORE
   *  the external call executes (e.g. CJ order remark, Stripe
   *  idempotency key). */
  idempotency_key: string | null;
  correlation_id: string | null;
}

export interface ClaimResult {
  claimed: boolean;
  /** Previous state before this claim attempt (for logging). */
  prevState: EventState | null;
  attempts: number;
}

/**
 * Pure claim-eligibility predicate. This is the logic the SQL RPC
 * implements; the isolated tests assert both agree on every case.
 */
export function isClaimEligible(
  row: Pick<
    EventRow,
    'state' | 'retryable' | 'next_attempt_at' | 'lease_expires_at'
  >,
  nowMs: number
): boolean {
  if (row.state === 'completed') return false; // terminal dedupe, forever
  if (row.state === 'received') return true; // initial unleased state
  if (row.state === 'failed') {
    return (
      row.retryable &&
      row.next_attempt_at !== null &&
      Date.parse(row.next_attempt_at) <= nowMs
    );
  }
  if (row.state === 'claimed' || row.state === 'processing') {
    // Crash redrive: only when the lease actually expired.
    return (
      row.lease_expires_at !== null &&
      Date.parse(row.lease_expires_at) < nowMs
    );
  }
  return false;
}

export function backoffMs(attempts: number): number {
  // 30s, 60s, 120s, ... capped at 1h. attempts>=1 here.
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

export interface EventStore {
  /** Idempotent register. Returns the row as it stands after the call. */
  register(eventId: string, eventType: string): Promise<EventRow>;
  /** Atomic claim per isClaimEligible. Exactly one concurrent winner. */
  claim(
    eventId: string,
    leaseToken: string,
    leaseMs: number,
    workerId: string,
    nowMs: number
  ): Promise<ClaimResult>;
  /** claimed -> processing, compare-and-set on the lease token. */
  beginProcessing(eventId: string, leaseToken: string): Promise<boolean>;
  /** processing -> completed, compare-and-set on the lease token. */
  complete(eventId: string, leaseToken: string): Promise<boolean>;
  /** processing -> failed (CAS on lease token), with retry scheduling. */
  fail(
    eventId: string,
    leaseToken: string,
    retryable: boolean,
    error: string,
    nowMs: number
  ): Promise<boolean>;
  /** Extend a live lease (CAS on lease token). */
  renewLease(
    eventId: string,
    leaseToken: string,
    leaseMs: number,
    nowMs: number
  ): Promise<boolean>;
  getEffect(effectKey: string): Promise<EffectRow | null>;
  /**
   * Record dispatch intent BEFORE the external call executes, with the
   * current event lease token as the owner (fencing). Returns false when
   * the effect already exists (owned by a live or expired worker — the
   * caller must read it and decide; never overwrite blindly).
   */
  recordEffectStart(
    effectKey: string,
    eventId: string,
    effectName: string,
    ownerToken: string,
    idempotencyKey?: string | null,
    correlationId?: string | null
  ): Promise<boolean>;
  /**
   * started -> completed. Compare-and-set on (effect_key, owner_token):
   * returns false when a stale worker tries to complete an effect owned
   * by someone else.
   */
  recordEffectDone(
    effectKey: string,
    externalId: string | null,
    ownerToken: string
  ): Promise<boolean>;
  /** started -> failed (CAS on owner token), with the failure kind. */
  recordEffectFailed(
    effectKey: string,
    error: string,
    ownerToken: string,
    failureKind: EffectFailureKind
  ): Promise<boolean>;
  /** started -> ambiguous (CAS on owner token): outcome unknown after
   *  dispatch; the row is the durable record for the operator queue. */
  recordEffectAmbiguous(
    effectKey: string,
    error: string,
    ownerToken: string
  ): Promise<boolean>;
}

/** Thrown when an external effect is in an ambiguous (started or
 *  ambiguous, outcome unknown) state. The caller must reconcile manually —
 *  never re-execute a non-idempotent external call blindly. */
export class AmbiguousEffectError extends Error {
  readonly effectKey: string;
  constructor(effectKey: string) {
    super(
      `ambiguous external effect ${effectKey}: started but outcome unknown; ` +
        `manual reconciliation required, will not re-execute`
    );
    this.name = 'AmbiguousEffectError';
    this.effectKey = effectKey;
  }
}

/**
 * Thrown by an external function when the remote call's outcome is
 * UNKNOWN after dispatch (timeout, connection reset after request bytes
 * may have been sent, 5xx with unknown side effects). The effect is
 * recorded `ambiguous` and never auto re-executed.
 */
export class ExternalUnknownOutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalUnknownOutcomeError';
  }
}

/**
 * Thrown by an external function when the remote call was DEFINITELY not
 * sent (auth/validation/4xx before dispatch). The effect is recorded
 * `failed` with failure_kind='not_sent' and may be retried.
 */
export class ExternalNotSentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalNotSentError';
  }
}

/**
 * Thrown when the external call SUCCEEDED but the local effect-ledger
 * write failed (even after bounded retries). This is NOT a failed
 * effect — re-running the external call would double-charge/order. It is
 * non-retryable: the operator reconciles against the provider dashboard
 * using the carried external id, then marks the effect.
 */
export class EffectLedgerWriteError extends Error {
  readonly effectKey: string;
  readonly externalId: string | null;
  constructor(effectKey: string, externalId: string | null, cause: string) {
    super(
      `effect ${effectKey} executed remotely (external id ${externalId ?? 'unknown'}) ` +
        `but the local ledger write failed: ${cause}. ` +
        `Reconcile against the provider dashboard; do not re-execute.`
    );
    this.name = 'EffectLedgerWriteError';
    this.effectKey = effectKey;
    this.externalId = externalId;
  }
}

/**
 * Thrown when a compare-and-set on the effect owner token misses: the
 * effect is owned by a different (live or redrive) worker. The stale
 * worker must stop; its event claim is handled by the normal
 * lease machinery.
 */
export class EffectOwnershipError extends Error {
  readonly effectKey: string;
  constructor(effectKey: string) {
    super(
      `effect ${effectKey}: owner-token CAS missed — a different worker owns this effect`
    );
    this.name = 'EffectOwnershipError';
    this.effectKey = effectKey;
  }
}

export interface EffectOutcome {
  /** The external id (e.g. CJ order id). From the ledger when skipped. */
  externalId: string | null;
  /** True when the effect was already completed and fn was NOT re-run. */
  skipped: boolean;
}

const RECORD_DONE_RETRIES = 3;

/**
 * Map a raw error thrown by an external integration to the typed
 * taxonomy. Conservative default for money: an untyped external error is
 * UNKNOWN (manual review), because repeating a call the remote side may
 * already have accepted is the worse failure. Integrators should throw
 * ExternalNotSentError / ExternalUnknownOutcomeError explicitly.
 */
export function classifyExternalError(err: unknown): Error {
  if (
    err instanceof ExternalUnknownOutcomeError ||
    err instanceof ExternalNotSentError
  ) {
    return err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Definitely-not-sent patterns: rejected before dispatch.
  if (
    /not configured|unauthorized|forbidden|invalid[_ ]request|validation|bad[_ ]request|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i.test(
      msg
    ) &&
    !/timeout|timed out|reset|socket hang up|5\d\d/i.test(msg)
  ) {
    return new ExternalNotSentError(msg);
  }
  return new ExternalUnknownOutcomeError(
    `untyped external error treated as unknown-after-dispatch: ${msg}`
  );
}

/**
 * Run an effect exactly-once per event (repair semantics, Nov 1):
 * - ledger says completed  -> return the recorded external id, skip work
 * - ledger says started/ambiguous + external -> AmbiguousEffectError
 *   (NEVER re-execute; reconciled via the manual-review queue)
 * - ledger says started + internal (idempotent) -> re-execute
 * - ledger says failed(kind=not_sent) -> re-execute (was never dispatched)
 * - ledger says failed(kind=unknown) + external -> AmbiguousEffectError
 * - absent -> record dispatch intent (with owner token + idempotency
 *   identity) BEFORE executing, then execute, then record done.
 *
 * Success-then-ledger-failure: fn() returning means the effect is DONE
 * remotely. recordEffectDone is retried (bounded); persistent failure
 * throws EffectLedgerWriteError (non-retryable, operator reconciles).
 * The old code's recordEffectFailed-on-ledger-failure downgrade is gone.
 */
export async function runEffect(
  store: EventStore,
  eventId: string,
  effectName: string,
  effectKey: string,
  fn: () => Promise<string | null>,
  opts: {
    external?: boolean;
    /** Lease token of the current event claim (effect owner / fencing). */
    ownerToken: string;
    /** Stable provider idempotency/correlation identity, persisted
     *  before dispatch. */
    idempotencyKey?: string | null;
    correlationId?: string | null;
  }
): Promise<EffectOutcome> {
  const external = opts.external === true;

  const existing = await store.getEffect(effectKey);
  if (existing?.status === 'completed') {
    return { externalId: existing.external_id, skipped: true };
  }
  if (existing && (existing.status === 'started' || existing.status === 'ambiguous')) {
    if (external) {
      // The remote side may already have acted. Never re-execute.
      throw new AmbiguousEffectError(effectKey);
    }
    // Internal idempotent effect: re-execution is safe. Continue to
    // re-run below (the start row already exists; do not overwrite).
  } else if (existing?.status === 'failed') {
    if (external && existing.failure_kind !== 'not_sent') {
      // A previous failure whose dispatch outcome was never proven:
      // treat as unknown, never blindly repeat.
      throw new AmbiguousEffectError(effectKey);
    }
    // failed + not_sent (or internal): safe to attempt again.
  } else {
    // No row yet: persist dispatch intent BEFORE the call executes, so
    // a crash/timeout after dispatch still leaves the started row.
    const started = await store.recordEffectStart(
      effectKey,
      eventId,
      effectName,
      opts.ownerToken,
      opts.idempotencyKey ?? null,
      opts.correlationId ?? null
    );
    if (!started) {
      // Lost a race with another worker: re-read and decide honestly.
      const raced = await store.getEffect(effectKey);
      if (raced?.status === 'completed') {
        return { externalId: raced.external_id, skipped: true };
      }
      if (external) throw new AmbiguousEffectError(effectKey);
    }
  }

  let externalId: string | null = null;
  let fnSucceeded = false;
  try {
    externalId = await fn();
    fnSucceeded = true;
  } catch (err) {
    const typed = external ? classifyExternalError(err) : err;
    if (typed instanceof ExternalUnknownOutcomeError) {
      await store.recordEffectAmbiguous(
        effectKey,
        typed.message.slice(0, 500),
        opts.ownerToken
      );
      throw new AmbiguousEffectError(effectKey);
    }
    const kind: EffectFailureKind =
      typed instanceof ExternalNotSentError ? 'not_sent' : 'unknown';
    const ok = await store.recordEffectFailed(
      effectKey,
      (typed instanceof Error ? typed.message : String(typed)).slice(0, 500),
      opts.ownerToken,
      kind
    );
    if (!ok) throw new EffectOwnershipError(effectKey);
    throw typed instanceof Error ? typed : new Error(String(typed));
  }

  // fn() SUCCEEDED: the external effect is done remotely. The ledger
  // write must not downgrade this to a retryable failure.
  let done = false;
  let lastDoneError = '';
  for (let i = 0; i < RECORD_DONE_RETRIES && !done; i++) {
    try {
      done = await store.recordEffectDone(effectKey, externalId, opts.ownerToken);
      if (!done) throw new EffectOwnershipError(effectKey);
    } catch (e) {
      lastDoneError = e instanceof Error ? e.message : String(e);
      if (e instanceof EffectOwnershipError) throw e;
      // Transient ledger failure: retry boundedly before escalating.
    }
  }
  if (!done) {
    throw new EffectLedgerWriteError(effectKey, externalId, lastDoneError);
  }
  return { externalId, skipped: false };
}

/** Non-retryable: the event is done failing; a human must intervene via
 *  the manual-review queue. Retryable: Stripe redelivery / a redrive
 *  worker may pick it up. */
export function classifyError(err: unknown): boolean {
  if (err instanceof AmbiguousEffectError) return false;
  if (err instanceof EffectLedgerWriteError) return false;
  if (err instanceof ExternalUnknownOutcomeError) return false;
  // Ledger-conflict (duplicate-safe insert found inconsistent data):
  // a human must reconcile; retrying the identical payload cannot help.
  if (err instanceof Error && err.name === 'LedgerConflictError') return false;
  // Effect-ownership loss: our lease was superseded. Retryable (500) so
  // a fresh delivery re-claims or defers to the live owner.
  if (err instanceof EffectOwnershipError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  // Programming/config errors: retrying the identical payload cannot help.
  if (/bad_signature|missing_signature|not configured|billing_not_configured/i.test(msg))
    return false;
  return true;
}

export function newLeaseToken(): string {
  return (
    'lease_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 14)
  );
}

/**
 * Outcome of one webhook delivery, for the route to map to HTTP status.
 * 200 is returned ONLY when the event is completed, deduped, deferred to
 * a live lease-holder, or failed non-retryable (manual review). Every
 * other failure returns 500 so Stripe retries. 400/503 are terminal
 * request/config outcomes, never retried as billing events.
 */
export type DeliveryOutcome =
  | { http: 200; body: { received: true; deduped?: true; deferred?: true; manualReview?: true } }
  | { http: 400; body: { error: string } }
  | { http: 500; body: { error: string; event_id?: string } }
  | { http: 503; body: { error: string } };

export const LEASE_MS = 60_000; // 1 minute processing lease
export const WORKER_ID = 'webhook-route';
