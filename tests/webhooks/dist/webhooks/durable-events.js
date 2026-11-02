"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKER_ID = exports.LEASE_MS = exports.EffectOwnershipError = exports.EffectLedgerWriteError = exports.ExternalNotSentError = exports.ExternalUnknownOutcomeError = exports.AmbiguousEffectError = void 0;
exports.isClaimEligible = isClaimEligible;
exports.backoffMs = backoffMs;
exports.classifyExternalError = classifyExternalError;
exports.runEffect = runEffect;
exports.classifyError = classifyError;
exports.newLeaseToken = newLeaseToken;
/**
 * Pure claim-eligibility predicate. This is the logic the SQL RPC
 * implements; the isolated tests assert both agree on every case.
 */
function isClaimEligible(row, nowMs) {
    if (row.state === 'completed')
        return false; // terminal dedupe, forever
    if (row.state === 'received')
        return true; // initial unleased state
    if (row.state === 'failed') {
        return (row.retryable &&
            row.next_attempt_at !== null &&
            Date.parse(row.next_attempt_at) <= nowMs);
    }
    if (row.state === 'claimed' || row.state === 'processing') {
        // Crash redrive: only when the lease actually expired.
        return (row.lease_expires_at !== null &&
            Date.parse(row.lease_expires_at) < nowMs);
    }
    return false;
}
function backoffMs(attempts) {
    // 30s, 60s, 120s, ... capped at 1h. attempts>=1 here.
    return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}
/** Thrown when an external effect is in an ambiguous (started or
 *  ambiguous, outcome unknown) state. The caller must reconcile manually —
 *  never re-execute a non-idempotent external call blindly. */
class AmbiguousEffectError extends Error {
    effectKey;
    constructor(effectKey) {
        super(`ambiguous external effect ${effectKey}: started but outcome unknown; ` +
            `manual reconciliation required, will not re-execute`);
        this.name = 'AmbiguousEffectError';
        this.effectKey = effectKey;
    }
}
exports.AmbiguousEffectError = AmbiguousEffectError;
/**
 * Thrown by an external function when the remote call's outcome is
 * UNKNOWN after dispatch (timeout, connection reset after request bytes
 * may have been sent, 5xx with unknown side effects). The effect is
 * recorded `ambiguous` and never auto re-executed.
 */
class ExternalUnknownOutcomeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ExternalUnknownOutcomeError';
    }
}
exports.ExternalUnknownOutcomeError = ExternalUnknownOutcomeError;
/**
 * Thrown by an external function when the remote call was DEFINITELY not
 * sent (auth/validation/4xx before dispatch). The effect is recorded
 * `failed` with failure_kind='not_sent' and may be retried.
 */
class ExternalNotSentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ExternalNotSentError';
    }
}
exports.ExternalNotSentError = ExternalNotSentError;
/**
 * Thrown when the external call SUCCEEDED but the local effect-ledger
 * write failed (even after bounded retries). This is NOT a failed
 * effect — re-running the external call would double-charge/order. It is
 * non-retryable: the operator reconciles against the provider dashboard
 * using the carried external id, then marks the effect.
 */
class EffectLedgerWriteError extends Error {
    effectKey;
    externalId;
    constructor(effectKey, externalId, cause) {
        super(`effect ${effectKey} executed remotely (external id ${externalId ?? 'unknown'}) ` +
            `but the local ledger write failed: ${cause}. ` +
            `Reconcile against the provider dashboard; do not re-execute.`);
        this.name = 'EffectLedgerWriteError';
        this.effectKey = effectKey;
        this.externalId = externalId;
    }
}
exports.EffectLedgerWriteError = EffectLedgerWriteError;
/**
 * Thrown when a compare-and-set on the effect owner token misses: the
 * effect is owned by a different (live or redrive) worker. The stale
 * worker must stop; its event claim is handled by the normal
 * lease machinery.
 */
class EffectOwnershipError extends Error {
    effectKey;
    constructor(effectKey) {
        super(`effect ${effectKey}: owner-token CAS missed — a different worker owns this effect`);
        this.name = 'EffectOwnershipError';
        this.effectKey = effectKey;
    }
}
exports.EffectOwnershipError = EffectOwnershipError;
const RECORD_DONE_RETRIES = 3;
/**
 * Map a raw error thrown by an external integration to the typed
 * taxonomy. Conservative default for money: an untyped external error is
 * UNKNOWN (manual review), because repeating a call the remote side may
 * already have accepted is the worse failure. Integrators should throw
 * ExternalNotSentError / ExternalUnknownOutcomeError explicitly.
 */
function classifyExternalError(err) {
    if (err instanceof ExternalUnknownOutcomeError ||
        err instanceof ExternalNotSentError) {
        return err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    // Definitely-not-sent patterns: rejected before dispatch.
    if (/not configured|unauthorized|forbidden|invalid[_ ]request|validation|bad[_ ]request|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i.test(msg) &&
        !/timeout|timed out|reset|socket hang up|5\d\d/i.test(msg)) {
        return new ExternalNotSentError(msg);
    }
    return new ExternalUnknownOutcomeError(`untyped external error treated as unknown-after-dispatch: ${msg}`);
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
async function runEffect(store, eventId, effectName, effectKey, fn, opts) {
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
    }
    else if (existing?.status === 'failed') {
        if (external && existing.failure_kind !== 'not_sent') {
            // A previous failure whose dispatch outcome was never proven:
            // treat as unknown, never blindly repeat.
            throw new AmbiguousEffectError(effectKey);
        }
        // failed + not_sent (or internal): safe to attempt again.
    }
    else {
        // No row yet: persist dispatch intent BEFORE the call executes, so
        // a crash/timeout after dispatch still leaves the started row.
        const started = await store.recordEffectStart(effectKey, eventId, effectName, opts.ownerToken, opts.idempotencyKey ?? null, opts.correlationId ?? null);
        if (!started) {
            // Lost a race with another worker: re-read and decide honestly.
            const raced = await store.getEffect(effectKey);
            if (raced?.status === 'completed') {
                return { externalId: raced.external_id, skipped: true };
            }
            if (external)
                throw new AmbiguousEffectError(effectKey);
        }
    }
    let externalId = null;
    let fnSucceeded = false;
    try {
        externalId = await fn();
        fnSucceeded = true;
    }
    catch (err) {
        const typed = external ? classifyExternalError(err) : err;
        if (typed instanceof ExternalUnknownOutcomeError) {
            await store.recordEffectAmbiguous(effectKey, typed.message.slice(0, 500), opts.ownerToken);
            throw new AmbiguousEffectError(effectKey);
        }
        const kind = typed instanceof ExternalNotSentError ? 'not_sent' : 'unknown';
        const ok = await store.recordEffectFailed(effectKey, (typed instanceof Error ? typed.message : String(typed)).slice(0, 500), opts.ownerToken, kind);
        if (!ok)
            throw new EffectOwnershipError(effectKey);
        throw typed instanceof Error ? typed : new Error(String(typed));
    }
    // fn() SUCCEEDED: the external effect is done remotely. The ledger
    // write must not downgrade this to a retryable failure.
    let done = false;
    let lastDoneError = '';
    for (let i = 0; i < RECORD_DONE_RETRIES && !done; i++) {
        try {
            done = await store.recordEffectDone(effectKey, externalId, opts.ownerToken);
            if (!done)
                throw new EffectOwnershipError(effectKey);
        }
        catch (e) {
            lastDoneError = e instanceof Error ? e.message : String(e);
            if (e instanceof EffectOwnershipError)
                throw e;
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
function classifyError(err) {
    if (err instanceof AmbiguousEffectError)
        return false;
    if (err instanceof EffectLedgerWriteError)
        return false;
    if (err instanceof ExternalUnknownOutcomeError)
        return false;
    // Ledger-conflict (duplicate-safe insert found inconsistent data):
    // a human must reconcile; retrying the identical payload cannot help.
    if (err instanceof Error && err.name === 'LedgerConflictError')
        return false;
    // Effect-ownership loss: our lease was superseded. Retryable (500) so
    // a fresh delivery re-claims or defers to the live owner.
    if (err instanceof EffectOwnershipError)
        return true;
    const msg = err instanceof Error ? err.message : String(err);
    // Programming/config errors: retrying the identical payload cannot help.
    if (/bad_signature|missing_signature|not configured|billing_not_configured/i.test(msg))
        return false;
    return true;
}
function newLeaseToken() {
    return ('lease_' +
        Date.now().toString(36) +
        '_' +
        Math.random().toString(36).slice(2, 14));
}
exports.LEASE_MS = 60_000; // 1 minute processing lease
exports.WORKER_ID = 'webhook-route';
