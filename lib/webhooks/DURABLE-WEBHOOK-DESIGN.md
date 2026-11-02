# Durable Stripe webhook lifecycle — design record (REVISED)

Branch: `lizzie/zervia-repair-2026-11-01` (from main@40647a81)
Date: Nov 1, 2026 (~08:00 MST) — repair per independent review #6555289723
(2am HOLD) and #6557697448 (morning review).

## What the 2am review reproduced (and this revision repairs)

The Oct 31 overtime build claimed "ambiguous external outcomes are never
blindly repeated". The review executed the module and showed: remote order
accepted but response times out → `runEffect` caught the error, recorded
status `failed`, `classifyError` returned retryable=true → the second
invocation RE-EXECUTED the external call (observed externalCalls=2).
Separately: the actual route still had `recordTransaction` insert →
`console.error` with no throw, and external-success-then-recordEffectDone
failure was downgraded to retryable-failed.

## Repair answers (point by point)

1. **Definitely-not-sent vs unknown-after-dispatch.** External functions
   throw a typed taxonomy (`classifyExternalError`):
   - `ExternalNotSentError` → effect `failed`, failure_kind='not_sent',
     retryable. Rejected before dispatch (auth/validation/4xx).
   - `ExternalUnknownOutcomeError` → effect `ambiguous`,
     failure_kind='unknown', NEVER auto re-executed. Timeout, reset,
     5xx-with-unknown side effects. Untyped external errors default to
     UNKNOWN (conservative for money).
2. **Ambiguous effects are never re-executed.** Any later invocation with
   the same effect key throws `AmbiguousEffectError` (external) → the
   event fails non-retryable → HTTP 200 `manualReview` → the durable
   `webhook_manual_review_queue` view (operator reconciles against the
   provider dashboard using the persisted idempotency/correlation
   identity, then marks the effect).
3. **External success + recordEffectDone DB failure is not a failed
   effect.** `fn()` returning means the effect is DONE remotely.
   recordEffectDone is retried (bounded, 3x); persistent failure throws
   `EffectLedgerWriteError` — non-retryable, carrying effect key +
   external id for reconciliation. The old recordEffectFailed downgrade
   is removed.
4. **Atomic effect ownership / fencing.** `recordEffectStart` persists
   the current event lease token as `owner_token` BEFORE dispatch
   (dispatch intent + stable provider idempotency/correlation identity
   are recorded first). done/failed/ambiguous are compare-and-set on
   (effect_key, owner_token): a stale worker's write misses
   (`EffectOwnershipError`). The event lease alone cannot stop a stale
   worker's external call; the owner token stops its ledger write from
   landing over the replacement.
5. **Ledger (lib/billing/ledger.ts).** Insert failures THROW — never
   silent. Idempotency key = provider + environment + merchant/account
   scope + effect type + provider effect id (per the morning review);
   the provider webhook event id is stored separately as
   `stripe_event_id` (receipt correlation, not uniqueness). On a
   unique-conflict the existing row's money fields are compared:
   consistent → idempotent success (no second credit); inconsistent →
   `LedgerConflictError` (non-retryable, manual review). Refunds stay
   distinct from captures (effect type is in the key).
6. **Ledger write + effect completion atomicity.** Within one worker the
   order is: fulfillment writes (throwing) → idempotent ledger insert →
   event `complete` (CAS on lease token). A redrive after any crash
   re-runs only idempotent steps (guarded order-claim transition,
   idempotent ledger key, completed-effect skip). The Postgres adapter
   performs each transition as a single RPC.
7. **Legacy backfill.** `stripe_events` → `webhook_events` as terminal
   `completed` with `legacy=true` AND `legacy_outcome_unknown=true`:
   dedupe preserved, nothing redriven, historical success NOT claimed.
   `webhook_legacy_reconciliation` produces the counts; unknown history
   is investigated explicitly.
8. **Migration status.** `20261101000000_webhook_events.sql` is REVISED
   and remains UNAPPLIED — separate review, no production migration
   authorized, staging/test-first.

## HTTP contract (unchanged shape, repaired semantics)

| Outcome | HTTP |
|---|---|
| Event completed | 200 `{received:true}` |
| Replay of completed event | 200 `{received:true, deduped:true}` |
| Live lease held by another worker / backoff pending / failed non-retryable claim | 200 `{received:true, deferred:true}` |
| Failed non-retryable (ambiguous effect, ledger-write-after-success, ledger conflict) | 200 `{received:true, manualReview:true}` → operator queue |
| Register/claim/DB failure, retryable fulfillment failure, stale lease on complete | 500 (Stripe retries) |
| Bad/missing signature | 400 (never registers, never writes) |
| Billing not configured | 503 |

200 is never returned for an un-completed, un-owned event.

## Files

- `lib/webhooks/durable-events.ts` — repaired state machine, typed
  external-error taxonomy, fencing, `EffectLedgerWriteError`.
  (tsc --strict: 0 errors)
- `lib/webhooks/stripe-handler.ts` — the REAL route logic (every event
  case from main@40647a81, no scope changes) extracted for dependency
  injection; the actual-route regression tests execute this module.
  (tsc --strict: 0 errors)
- `lib/billing/ledger.ts` — loud, duplicate-safe ledger.
  (tsc --strict: 0 errors)
- `lib/webhooks/supabase-event-store.ts` — Postgres adapter for the new
  RPCs. Reviewed, not executed (no DB tonight).
- `supabase/migrations/20261101000000_webhook_events.sql` — revised,
  UNAPPLIED.
- `app/api/stripe/webhook/route.ts` — thin Next.js adapter: wires prod
  deps, maps DeliveryOutcome → NextResponse. No billing logic here.
- `tests/webhooks/` — 25 executed tests (see below).

## Test report (method: executed tests, node --test)

`tests/webhooks/durable-webhook.test.mjs` — 12/12 PASS, incl. the exact
2am repro repaired (timeout-after-dispatch → ambiguous → second
invocation does NOT re-execute, externalCalls stays 1), the
success-then-ledger-failure case (EffectLedgerWriteError, effect stays
`started` — never downgraded to failed), fencing CAS, and
classifyError routing.

`tests/webhooks/route-regression.test.mjs` — 13/13 PASS against the REAL
handler module: duplicate delivery → single ledger credit; concurrent
duplicates → one winner/one row; timeout-after-dispatch → manualReview +
redrive deferred + CJ called once; crash between external response and
ledger write → manualReview + effect stays `started`; transient
ledger failure → bounded retry recovers; ledger insert outage → 500 then
idempotent redelivery credits once; inconsistent repeat payload →
LedgerConflictError → manualReview; expired lease → redrive completes +
stale completion rejected; invoice.paid duplicate → one credit;
payment_intent.payment_failed → marks failed; refund vs capture keys
distinct; bad signature → 400 with zero writes; billing unconfigured →
503.

Memory stores stand in for Postgres row-lock atomicity (mutex-serialized
claims, CAS on tokens); the Supabase adapter + SQL are reviewed, not
executed — no test database exists tonight. The DB-backed leg stays
BLOCKED on the owner's TEST Supabase project ref + keys.

## Residuals / honest limits

- No real Stripe/DB execution (no test env); adapter + SQL reviewed only.
- The PayPal webhook route was not touched (out of this repair's scope;
  same ledger module is available for its follow-up).
- Crash-redrive for events Stripe never redelivers still needs the
  operator runbook query (5-min) or a running recovery worker — the
  queue VIEW ships in the migration; the worker is not built here.
- Escrow event-case behavior is preserved from main@40647a81 unchanged
  (held-fund scope investigation is a separate track, not this branch).
