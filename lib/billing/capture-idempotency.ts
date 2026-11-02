/**
 * PayPal capture-route idempotency + durable completion states
 * (Nov 1–2, 2026 — repair branch `lizzie/zervia-repair-2026-11-01`).
 *
 * The capture route records the PayPal order id in `paypal_orders`
 * BEFORE capturing, so a double return (or a replayed return URL)
 * fulfills at most once. The insert result must be discriminated:
 *
 * - no error            -> 'claimed':   first sighting; proceed to
 *                                        capture + fulfill.
 * - code '23505'        -> 'duplicate': a unique-violation on
 *   (unique violation)   paypal_order_id — a prior run already owns
 *                                        fulfillment; the status machine
 *                                        below decides what to do.
 * - any other error     -> 'db_error':  the claim row could NOT be
 *                                        recorded (DB outage, RLS, ...).
 *                                        The caller MUST abort BEFORE
 *                                        capture: charging a buyer we
 *                                        cannot track for fulfillment is
 *                                        worse than showing an error.
 *
 * The pre-fix code treated every insert failure as "already seen"
 * (`alreadySeen = !claimed`), so a transient DB failure at the claim
 * step silently led to capture-without-fulfillment — the buyer was
 * charged and nothing was activated. This module makes the three
 * outcomes explicit and testable.
 *
 * STATUS MACHINE (Nov 2, 2026 — GPT-aligned repair of the confirmed
 * defect where a duplicate claim STILL called the PayPal capture API:
 * the old route skipped fulfillment on duplicates but captured anyway).
 * Independent-review hardening (Nov 2, same day): fulfillment ownership
 * via 'recovering', fail-closed ledger guard, crash-adoption, checked
 * markCaptured, fail-closed pre-migration.
 *
 *   claimed → capturing → captured → recovering → fulfilled
 *                 └→ failed (terminal: operator reconciles)
 *
 * - claimed:    row inserted, no capture attempted yet.
 * - capturing: exactly one worker holds the atomic claimed→capturing
 *               compare-and-set and owns the PayPal capture call. The
 *               FIRST sighting takes it too (bulk-fix hardening): a
 *               duplicate arriving mid-capture can no longer win the
 *               race and issue a second capture call.
 * - captured:   PayPal returned COMPLETED; capture_id (+captured_at)
 *               persisted BEFORE the amount check (persist CHECKED — a
 *               failed persist fails closed to operator reconciliation).
 *               A row stuck here means "money moved, fulfillment not
 *               confirmed" — the crash-recovery path fulfills it (never
 *               re-captures), guarded by the transactions ledger.
 * - recovering: fulfillment ownership. EXACTLY ONE worker (the owner
 *               after its own capture, or one recovery worker) holds the
 *               atomic captured→recovering compare-and-set and runs
 *               fulfill(). This closes the double-fulfill race where two
 *               concurrent recovery workers both fulfilled before either
 *               marked.
 * - fulfilled:  fulfillment ran, then the atomic recovering→fulfilled
 *               mark landed (act-then-mark — never a lying row). A prior
 *               run that fulfilled but crashed before marking is
 *               converged via the ledger guard (no double-record).
 * - failed:     terminal. Capture threw / incomplete / amount mismatch
 *               / fulfill threw / ledger guard unreadable / migration
 *               gate. Duplicates get the failure page — never a
 *               re-capture, never a false success. The operator
 *               reconciles via status + capture_id + last_error and the
 *               PayPal dashboard (explicit uncertain-outcome
 *               reconciliation).
 *
 * CRASH-ADOPTION: a duplicate that loses the capture race and exhausts
 * its poll on a non-terminal row checks the FRESH PayPal order GET: if
 * it shows a completed capture, the owner crashed between the capture
 * call and markCaptured(). The row is converged to 'captured' with that
 * capture id (atomic CAS, never clobbering fulfilled/failed) and the
 * normal recovery path drives fulfillment.
 *
 * PRE-CAPTURE VALIDATION (F-CAP-5): the order's authorized amount is
 * checked against server truth BEFORE the claim insert and BEFORE any
 * capture call — the old code only validated after capture.
 *
 * MIGRATION GATE (fail-closed): the status columns arrive via
 * supabase/migrations/20261102_paypal_orders_completion_states.sql
 * (UNAPPLIED — applying needs the owner's named migration GO). The
 * flow probes for them; when ABSENT it fails CLOSED — zero capture
 * calls, zero fulfills, no false success. This supersedes the Nov 1
 * degrade-to-success behavior (a confirmed false-success defect).
 * Only positive probe results are cached; a transient DB error never
 * poisons the gate. Billing stays off until the migration is applied,
 * so nothing legitimate is blocked.
 *
 * Schema: supabase/migrations/20261102_paypal_orders_completion_states.sql
 * (UNAPPLIED — applying needs the owner's named migration GO).
 *
 * Import-free by design: unit-tested directly with Node's built-in
 * runner + type stripping (same pattern as lib/provider-tiers.ts), and
 * imported by the Next.js route via the `@/` alias. The Supabase admin
 * client is received through the structural `FlowAdmin` interface, so
 * tests inject a fake — no database, no network, no PayPal calls.
 */

export type CaptureClaimDecision = 'claimed' | 'duplicate' | 'db_error';

/** Postgres unique-violation code (supabase-js surfaces it as error.code). */
export const UNIQUE_VIOLATION = '23505';

export function decideCaptureClaim(
  error: { code?: string } | null | undefined
): CaptureClaimDecision {
  if (!error) return 'claimed';
  if (error.code === UNIQUE_VIOLATION) return 'duplicate';
  return 'db_error';
}

/** Durable completion states on `paypal_orders.status`. */
export type CaptureOrderStatus =
  | 'claimed'
  | 'capturing'
  | 'captured'
  | 'recovering'
  | 'fulfilled'
  | 'failed';

export type FlowDbError = { code?: string; message: string };

type FlowSingleRow = {
  data: unknown;
  error: FlowDbError | null;
};
type FlowRowList = {
  data: Array<Record<string, unknown>>;
  error: FlowDbError | null;
};

/**
 * Structural subset of the supabase-js surface the flow uses. The real
 * service-role client satisfies this; tests inject an in-memory fake.
 * All terminal calls are typed as PromiseLike (not Promise) because the
 * real client's chain builders are thenables, not native promises.
 */
export interface FlowInsertChain {
  select(columns: string): {
    single(): PromiseLike<FlowSingleRow>;
  };
}
export interface FlowSelectChain {
  eq(column: string, value: unknown): FlowSelectChain;
  single(): PromiseLike<{
    data: Record<string, unknown> | null;
    error: FlowDbError | null;
  }>;
  limit(n: number): PromiseLike<{
    data: Record<string, unknown>[] | null;
    error: FlowDbError | null;
  }>;
}
export interface FlowUpdateChain {
  eq(column: string, value: unknown): FlowUpdateChain;
  in(column: string, values: unknown[]): FlowUpdateChain;
  select(columns?: string): PromiseLike<FlowRowList>;
}
export interface FlowTable {
  insert(row: Record<string, unknown>): FlowInsertChain;
  select(columns: string): FlowSelectChain;
  update(patch: Record<string, unknown>): FlowUpdateChain;
}
export interface FlowAdmin {
  from(table: string): FlowTable;
}

export type CaptureKind =
  | 'boost'
  | 'verification_badge'
  | 'featured_week'
  | 'profile_spotlight';

export interface CaptureCustom {
  kind: CaptureKind;
  user_id: string;
  provider_id: string;
  listing_id: string | null;
  currency: string;
}

/** Normalized capture details (from the capture POST or the order GET). */
export interface FlowCapture {
  id: string;
  status: string;
  amountValue: string;
  amountCurrency: string;
}

export interface FulfillArgs {
  kind: CaptureKind;
  userId: string;
  providerId: string;
  listingId: string | null;
  paypalOrderId: string;
  paypalCaptureId: string | null;
  amountCents: number;
  currency: string;
  description: string;
}

export interface CaptureFlowDeps {
  admin: FlowAdmin;
  orderId: string;
  custom: CaptureCustom;
  description: string;
  /** PayPal capture POST — idempotent per order on PayPal's side (a
   *  repeated POST returns the existing capture; never double-charges). */
  captureOrder: (orderId: string) => Promise<FlowCapture>;
  /**
   * Capture details parsed from the return-URL order GET (read-only).
   * Present when PayPal already captured the order (i.e. on a duplicate
   * return). Used ONLY to re-verify the amount on the crash-recovery
   * path — it never triggers a capture call.
   */
  orderCapture: FlowCapture | null;
  /**
   * Authorized amount parsed from the return-URL order GET (read-only).
   * Validated against server truth BEFORE the claim insert and BEFORE
   * any capture call (F-CAP-5: the old code only validated after
   * capture, so "mismatch aborts buyer charge" overstated the
   * protection). Null when the order GET carries no amount.
   */
  authorizedAmount: { value?: string; currency_code?: string } | null;
  fulfill: (args: FulfillArgs) => Promise<void>;
  /** Server-truth price: recomputed from kind + provider currency. */
  resolveExpected: () => Promise<{ expectedCents: number; currency: string }>;
  toPayPalValue: (cents: number) => string;
  log?: (message: string, ...args: unknown[]) => void;
  /** Delay between status re-reads on the contended path (ms). Default 400. */
  pollDelayMs?: number;
}

export type CaptureFlowResult =
  | {
      ok: true;
      captureCalls: number;
      fulfillCalls: number;
      terminalStatus: CaptureOrderStatus | 'unknown';
    }
  | {
      ok: false;
      reason: string;
      captureCalls: number;
      fulfillCalls: number;
    };

const nowIso = (): string => new Date().toISOString();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Column probes (Nov 2 bulk-fix hardening).                            */
/*                                                                      */
/* The completion columns (status, capture_id) arrive via migration     */
/* 20261102_paypal_orders_completion_states.sql, which is UNAPPLIED     */
/* (owner GO required). The code must be safely deployable BEFORE the   */
/* migration: probe once per process; when the columns are absent the   */
/* flow degrades to the Nov 1 insert-discriminate behavior (duplicate   */
/* -> skip to success, never capture; db_error -> abort). Fail-closed   */
/* everywhere: a probe error counts as "columns absent", and an         */
/* unreadable claim row is a db_error, never a duplicate.               */
/* ------------------------------------------------------------------ */

const completionProbe: { v: boolean | null } = { v: null };
let completionOverride: boolean | null = null;
/** Test hook: force the (status, capture_id) column probe result. */
export function setCompletionColumnsOverride(v: boolean | null): void {
  completionOverride = v;
  completionProbe.v = null;
}

async function hasCompletionColumns(admin: FlowAdmin): Promise<boolean> {
  if (completionOverride !== null) return completionOverride;
  if (completionProbe.v !== null) return completionProbe.v;
  // Independent-review hardening: only cache POSITIVE probe results. A
  // transient DB error must not poison the cache into permanent
  // fail-closed; the next call re-probes.
  try {
    const { error } = await admin
      .from('paypal_orders')
      .select('status,capture_id')
      .limit(0);
    if (!error) completionProbe.v = true;
    return !error;
  } catch {
    return false;
  }
}

const txProbe: { v: boolean | null } = { v: null };
let txOverride: boolean | null = null;
/** Test hook: force the transactions.paypal_order_id probe result. */
export function setTransactionColumnOverride(v: boolean | null): void {
  txOverride = v;
  txProbe.v = null;
}

async function hasTransactionOrderColumn(admin: FlowAdmin): Promise<boolean> {
  if (txOverride !== null) return txOverride;
  if (txProbe.v !== null) return txProbe.v;
  try {
    const { error } = await admin.from('transactions').select('paypal_order_id').limit(0);
    txProbe.v = !error;
  } catch {
    txProbe.v = false;
  }
  return txProbe.v;
}

/**
 * Ledger idempotency guard for the captured-recovery path: true when
 * the transactions ledger already holds a succeeded row for this order
 * (a previous run fulfilled but crashed before marking). Null when the
 * column is absent and the check cannot be performed.
 */
async function hasSucceededTransaction(
  admin: FlowAdmin,
  orderId: string
): Promise<boolean | null> {
  if (!(await hasTransactionOrderColumn(admin))) return null;
  const { data, error } = await admin
    .from('transactions')
    .select('id')
    .eq('paypal_order_id', orderId)
    .eq('status', 'succeeded')
    .limit(1);
  if (error) return null;
  return (data?.length ?? 0) > 0;
}

async function readStatus(
  admin: FlowAdmin,
  orderId: string
): Promise<{ ok: true; status: string } | { ok: false }> {
  try {
    const { data, error } = await admin
      .from('paypal_orders')
      .select('status')
      .eq('paypal_order_id', orderId)
      .single();
    if (error || !data || typeof data.status !== 'string') return { ok: false };
    return { ok: true, status: data.status };
  } catch {
    return { ok: false };
  }
}

/**
 * Atomic claimed → capturing. Exactly one concurrent claimant wins and
 * owns the PayPal capture call; losers match zero rows.
 */
async function tryBeginCapture(
  admin: FlowAdmin,
  orderId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('paypal_orders')
    .update({ status: 'capturing' })
    .eq('paypal_order_id', orderId)
    .eq('status', 'claimed')
    .select('paypal_order_id');
  if (error) return false;
  return (data?.length ?? 0) === 1;
}

/**
 * Release the capture lease when the capture call failed WITHOUT a
 * COMPLETED capture: no money moved (or the outcome is unknown — PayPal
 * dedupes captures per order, so a later retry's capture POST returns
 * the existing capture). The row returns to 'claimed' so a buyer retry
 * re-attempts the capture instead of polling a stuck 'capturing' row
 * into a false success. The eq(status,'capturing') guard never clobbers
 * a row that advanced past the lease. (Peer 74760d84, Nov 2.)
 */
async function releaseCaptureLease(
  admin: FlowAdmin,
  orderId: string
): Promise<void> {
  await admin
    .from('paypal_orders')
    .update({ status: 'claimed' })
    .eq('paypal_order_id', orderId)
    .eq('status', 'capturing')
    .select('paypal_order_id');
}

/**
 * Persist 'captured' (+capture_id) BEFORE the amount check. The
 * compare-and-set on (claimed, capturing) means a concurrent worker can
 * never clobber a 'captured'/'fulfilled' row.
 *
 * Independent-review hardening (Nov 2): the rowcount is CHECKED, not
 * informational. A failed/zero-row persist after a completed capture is
 * an uncertain-outcome state — the caller must fail closed to operator
 * reconciliation rather than fulfilling on an unrecorded capture.
 */
async function markCaptured(
  admin: FlowAdmin,
  orderId: string,
  captureId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('paypal_orders')
    .update({ status: 'captured', capture_id: captureId, captured_at: nowIso() })
    .eq('paypal_order_id', orderId)
    .in('status', ['claimed', 'capturing'])
    .select('paypal_order_id');
  if (error) return false;
  return (data?.length ?? 0) === 1;
}

/**
 * Fulfillment ownership (Nov 2 independent-review hardening): the atomic
 * captured → recovering transition. EXACTLY ONE worker — the owner after
 * its own capture, or one recovery worker on a duplicate — may hold
 * 'recovering' and run fulfill(). This closes the double-fulfill race
 * where two concurrent recovery workers both passed the ledger guard and
 * both called fulfill() before either marked fulfilled.
 */
async function tryBeginRecovery(
  admin: FlowAdmin,
  orderId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('paypal_orders')
    .update({ status: 'recovering' })
    .eq('paypal_order_id', orderId)
    .eq('status', 'captured')
    .select('paypal_order_id');
  if (error) return false;
  return (data?.length ?? 0) === 1;
}

/**
 * Exactly-once fulfillment mark for the recovering worker: the atomic
 * recovering → fulfilled transition, called AFTER fulfill() succeeds.
 */
async function tryMarkRecovered(admin: FlowAdmin, orderId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('paypal_orders')
    .update({ status: 'fulfilled', fulfilled_at: nowIso() })
    .eq('paypal_order_id', orderId)
    .eq('status', 'recovering')
    .select('paypal_order_id');
  if (error) return false;
  return (data?.length ?? 0) === 1;
}

/**
 * Crash-adoption (Nov 2 independent-review hardening): after poll
 * exhaustion on a non-terminal row, if the FRESH PayPal order GET shows
 * a completed capture for this order, converge the row to 'captured'
 * with that capture ID and let the normal recovery path drive
 * fulfillment. Covers the crash window between a successful PayPal
 * capture and the markCaptured() persist (row stuck in claimed/capturing
 * with money moved but no capture_id). The CAS never clobbers
 * fulfilled/failed.
 */
async function tryAdoptCaptured(
  admin: FlowAdmin,
  orderId: string,
  captureId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('paypal_orders')
    .update({ status: 'captured', capture_id: captureId, captured_at: nowIso() })
    .eq('paypal_order_id', orderId)
    .in('status', ['claimed', 'capturing', 'recovering'])
    .select('paypal_order_id');
  if (error) return false;
  return (data?.length ?? 0) === 1;
}

/**
 * Exactly-once fulfillment mark: the atomic captured → fulfilled
 * transition. Called AFTER fulfill() succeeds (act-then-mark): a crash
 * between fulfill and mark leaves 'captured', and the recovery path
 * re-drives fulfillment guarded by the transactions ledger — never a
 * lying 'fulfilled' row for an unfulfilled order.
 */
async function tryMarkFulfilled(admin: FlowAdmin, orderId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('paypal_orders')
    .update({ status: 'fulfilled', fulfilled_at: nowIso() })
    .eq('paypal_order_id', orderId)
    .eq('status', 'captured')
    .select('paypal_order_id');
  if (error) return false;
  return (data?.length ?? 0) === 1;
}

/**
 * Terminal failure (Nov 2 bulk-fix hardening): the row stops all
 * automatic re-drive. Duplicates on a failed row get the failure page
 * — never a re-capture and never a false success. The operator
 * reconciles via status + capture_id + last_error and the PayPal
 * dashboard (explicit uncertain-outcome reconciliation, Codex §4).
 */
async function markFailed(
  admin: FlowAdmin,
  orderId: string,
  reason: string
): Promise<void> {
  await admin
    .from('paypal_orders')
    .update({ status: 'failed', last_error: reason })
    .eq('paypal_order_id', orderId)
    .in('status', ['claimed', 'capturing', 'captured', 'recovering'])
    .select('paypal_order_id');
}

/**
 * Brief grace poll for a duplicate that lost the capture race: gives the
 * owning worker a moment to land 'captured'/'fulfilled' before this
 * request redirects to success.
 */
async function pollForCompletion(
  admin: FlowAdmin,
  orderId: string,
  delayMs: number
): Promise<string> {
  let last = 'unknown';
  for (let i = 0; i < 8; i++) {
    const seen = await readStatus(admin, orderId);
    if (seen.ok) {
      last = seen.status;
      if (last === 'fulfilled' || last === 'captured' || last === 'failed') return last;
    }
    await sleep(delayMs);
  }
  return last;
}

function amountsMatch(
  cap: FlowCapture,
  expected: { expectedCents: number; currency: string },
  toPayPalValue: (cents: number) => string
): boolean {
  return (
    cap.amountValue === toPayPalValue(expected.expectedCents) &&
    cap.amountCurrency.toLowerCase() === expected.currency
  );
}

function fulfillArgs(
  custom: CaptureCustom,
  orderId: string,
  captureId: string | null,
  expected: { expectedCents: number; currency: string },
  description: string
): FulfillArgs {
  return {
    kind: custom.kind,
    userId: custom.user_id,
    providerId: custom.provider_id,
    listingId: custom.listing_id,
    paypalOrderId: orderId,
    paypalCaptureId: captureId,
    amountCents: expected.expectedCents,
    currency: expected.currency,
    description,
  };
}

/**
 * Durable PayPal capture flow. All PayPal/DB access goes through the
 * injected deps — the route supplies the real implementations, tests
 * supply fakes.
 *
 * Returns ok:true → redirect to the success page; ok:false → redirect
 * to the failure page. No real charge or fulfillment ever happens here
 * beyond what the injected deps do.
 */
/**
 * Crash-recovery for a 'captured' row: fulfill WITHOUT re-capture.
 * Re-verifies the amount against the read-only order GET, skips
 * fulfillment when the ledger already recorded this order (a previous
 * run fulfilled but crashed before marking), then fulfills and marks
 * (act-then-mark — never a lying 'fulfilled' row).
 */
async function recoverCaptured(
  admin: FlowAdmin,
  deps: {
    orderId: string;
    custom: CaptureCustom;
    description: string;
    orderCapture: FlowCapture | null;
    fulfill: (args: FulfillArgs) => Promise<void>;
    toPayPalValue: (cents: number) => string;
    log: (message: string, ...args: unknown[]) => void;
    pollDelayMs?: number;
  },
  expected: { expectedCents: number; currency: string },
  counters: { captureCalls: number; fulfillCalls: number }
): Promise<CaptureFlowResult> {
  const { orderId, custom, description, orderCapture, fulfill, toPayPalValue, log } = deps;
  const pollDelayMs = deps.pollDelayMs ?? 400;
  if (!orderCapture || !amountsMatch(orderCapture, expected, toPayPalValue)) {
    log(
      '[paypal/capture] recovery amount check failed — leaving captured for manual review',
      orderId
    );
    return { ok: false, reason: 'amount_mismatch', ...counters };
  }
  // Independent-review hardening (Nov 2): an UNREADABLE ledger guard
  // fails CLOSED. hasSucceededTransaction() returns null when the guard
  // column is absent or the ledger read errors — treating that as "not
  // recorded" would double-fulfill a previous run that fulfilled and
  // crashed before marking. Operator reconciles instead.
  const recorded = await hasSucceededTransaction(admin, orderId);
  if (recorded === null) {
    log(
      '[paypal/capture] recovery ledger guard unreadable — failing closed for manual review',
      orderId
    );
    return { ok: false, reason: 'ledger_unreadable', ...counters };
  }
  if (recorded) {
    // A previous run fulfilled but crashed before marking: do not
    // double-record the ledger; just converge the row to fulfilled.
    if (await tryMarkFulfilled(admin, orderId)) {
      return { ok: true, ...counters, terminalStatus: 'fulfilled' };
    }
    return resolveRacedRecovery(admin, orderId, log, counters, pollDelayMs);
  }
  // Fulfillment ownership: exactly one worker holds 'recovering'.
  if (!(await tryBeginRecovery(admin, orderId))) {
    return resolveRacedRecovery(admin, orderId, log, counters, pollDelayMs);
  }
  try {
    await fulfill(fulfillArgs(custom, orderId, orderCapture.id, expected, description));
  } catch (err) {
    log('[paypal/capture] recovery fulfill failed', orderId, err);
    await markFailed(admin, orderId, 'fulfill_failed');
    return { ok: false, reason: 'fulfill_failed', ...counters };
  }
  counters.fulfillCalls++;
  if (await tryMarkRecovered(admin, orderId)) {
    return { ok: true, ...counters, terminalStatus: 'fulfilled' };
  }
  // Lost the mark race after fulfilling: converge via a fresh read.
  return resolveRacedRecovery(admin, orderId, log, counters, pollDelayMs);
}

/**
 * A worker that lost a fulfillment race (or found an already-recorded
 * ledger) resolves by polling for the winner's terminal state:
 * fulfilled → success, failed → failure, anything else after the poll
 * window → uncertain (operator reconciles). The poll gives the
 * 'recovering' worker a moment to land before this request gives up.
 */
async function resolveRacedRecovery(
  admin: FlowAdmin,
  orderId: string,
  log: (message: string, ...args: unknown[]) => void,
  counters: { captureCalls: number; fulfillCalls: number },
  pollDelayMs = 400
): Promise<CaptureFlowResult> {
  const terminal = await pollForCompletion(admin, orderId, pollDelayMs);
  if (terminal === 'fulfilled') {
    return { ok: true, ...counters, terminalStatus: 'fulfilled' };
  }
  if (terminal === 'failed') {
    return { ok: false, reason: 'already_failed', ...counters };
  }
  log('[paypal/capture] recovery race unresolved', orderId, terminal);
  return { ok: false, reason: 'fulfill_mark_uncertain', ...counters };
}

export async function runCaptureFlow(
  deps: CaptureFlowDeps
): Promise<CaptureFlowResult> {
  const {
    admin,
    orderId,
    custom,
    description,
    captureOrder,
    orderCapture,
    authorizedAmount,
    fulfill,
    resolveExpected,
    toPayPalValue,
  } = deps;
  const log =
    deps.log ??
    ((message: string, ...args: unknown[]) => {
      console.error(message, ...args);
    });
  const pollDelayMs = deps.pollDelayMs ?? 400;
  const counters = { captureCalls: 0, fulfillCalls: 0 };

  // 0. Migration gate (Nov 2 independent-review hardening): the
  //    completion-state columns are a HARD prerequisite for processing
  //    any capture. Pre-migration the flow fails CLOSED — zero capture
  //    calls, zero fulfills, no false success. This supersedes the Nov 1
  //    legacy degrade-to-success behavior (a confirmed false-success
  //    defect): billing stays off until the migration is applied, so
  //    nothing legitimate is blocked.
  const completion = await hasCompletionColumns(admin);
  if (!completion) {
    log(
      '[paypal/capture] completion-state columns absent — failing closed (migration required)',
      orderId
    );
    return { ok: false, reason: 'migration_required', ...counters };
  }

  // 1. Server truth + PRE-CAPTURE amount validation (F-CAP-5): the
  //    order's AUTHORIZED amount must match before we claim or capture
  //    anything. resolveExpected may throw (providers read failed) —
  //    that propagates to the route's catch → failure page.
  const expected = await resolveExpected();
  if (
    !authorizedAmount ||
    !amountsMatch(
      {
        id: '',
        status: '',
        amountValue: authorizedAmount.value ?? '',
        amountCurrency: authorizedAmount.currency_code ?? '',
      },
      expected,
      toPayPalValue
    )
  ) {
    log(
      '[paypal/capture] AUTHORIZED AMOUNT MISMATCH — aborting before claim/capture',
      orderId,
      `authorized=${authorizedAmount?.value} ${authorizedAmount?.currency_code}`,
      `expected=${toPayPalValue(expected.expectedCents)} ${expected.currency}`
    );
    return { ok: false, reason: 'auth_amount_mismatch', ...counters };
  }

  // 2. Idempotency claim BEFORE any money moves. The migration gate
  //    above guarantees the status column exists, so the claim always
  //    carries 'claimed'.
  const { error: claimError } = await admin
    .from('paypal_orders')
    .insert({
      paypal_order_id: orderId,
      kind: custom.kind,
      provider_id: custom.provider_id,
      status: 'claimed',
    })
    .select('paypal_order_id')
    .single();
  const decision = decideCaptureClaim(claimError ?? null);
  if (decision === 'db_error') {
    log(
      '[paypal/capture] idempotency claim failed — aborting BEFORE capture',
      orderId,
      claimError?.message
    );
    return { ok: false, reason: 'claim_failed', ...counters };
  }

  if (decision === 'duplicate') {
    const seen = await readStatus(admin, orderId);
    if (!seen.ok) {
      // A 23505 means the row exists; if we cannot read it, fail safe:
      // never capture or fulfill blind.
      log(
        '[paypal/capture] duplicate claim but status unreadable — failing safe',
        orderId
      );
      return { ok: false, reason: 'status_unreadable', ...counters };
    }
    if (seen.status === 'fulfilled') {
      // Prior run completed: success with ZERO capture calls. This is
      // the confirmed-defect fix — the old code called capture here.
      return { ok: true, ...counters, terminalStatus: 'fulfilled' };
    }
    if (seen.status === 'failed') {
      // Terminal failure: never re-capture, never report success.
      return { ok: false, reason: 'already_failed', ...counters };
    }
    if (seen.status === 'captured') {
      // Crash recovery: a prior run captured but never fulfilled.
      return recoverCaptured(
        admin,
        { orderId, custom, description, orderCapture, fulfill, toPayPalValue, log, pollDelayMs },
        expected,
        counters
      );
    }
    // 'claimed', 'capturing', or 'recovering': race to become the
    // capturer (a worker holding 'recovering' is fulfilling; poll for
    // its outcome rather than interfering).
    if (!(await tryBeginCapture(admin, orderId))) {
      // Lost the race: resolve via the winner's terminal state. Only a
      // 'fulfilled' observation reports success — 'captured' runs the
      // recovery fulfill; anything else fails closed (never a false
      // success on a pending/failed row, Codex §4).
      const terminal = await pollForCompletion(admin, orderId, pollDelayMs);
      log('[paypal/capture] duplicate lost capture race', orderId, terminal);
      if (terminal === 'fulfilled') {
        return { ok: true, ...counters, terminalStatus: 'fulfilled' };
      }
      if (terminal === 'captured') {
        return recoverCaptured(
          admin,
          { orderId, custom, description, orderCapture, fulfill, toPayPalValue, log, pollDelayMs },
          expected,
          counters
        );
      }
      // Independent-review hardening: crash-adoption. The row is stuck
      // non-terminal after poll exhaustion; if the FRESH PayPal order
      // GET shows a completed capture for this order, the owner crashed
      // between the capture call and markCaptured(). Adopt the capture
      // id and let recovery drive fulfillment instead of failing with
      // money moved and no operator-visible capture id.
      if (orderCapture && orderCapture.status === 'COMPLETED' && orderCapture.id) {
        if (await tryAdoptCaptured(admin, orderId, orderCapture.id)) {
          log('[paypal/capture] adopted completed capture after owner crash', orderId, orderCapture.id);
          return recoverCaptured(
            admin,
            { orderId, custom, description, orderCapture, fulfill, toPayPalValue, log, pollDelayMs },
            expected,
            counters
          );
        }
        // Adopt lost the CAS: re-read — the owner may have landed
        // 'captured' (or finished) between the poll and the adopt.
        const recheck = await readStatus(admin, orderId);
        if (recheck.ok && recheck.status === 'captured') {
          return recoverCaptured(
            admin,
            { orderId, custom, description, orderCapture, fulfill, toPayPalValue, log, pollDelayMs },
            expected,
            counters
          );
        }
        if (recheck.ok && recheck.status === 'fulfilled') {
          return { ok: true, ...counters, terminalStatus: 'fulfilled' };
        }
      }
      return { ok: false, reason: `race_unresolved_${terminal}`, ...counters };
    }
    // Won the race: fall through to capture.
  } else {
    // First sighting: take 'capturing' BEFORE the capture call so a
    // duplicate arriving mid-capture cannot win the race and issue a
    // second capture call (bulk-fix hardening of the race window).
    if (!(await tryBeginCapture(admin, orderId))) {
      const terminal = await pollForCompletion(admin, orderId, pollDelayMs);
      if (terminal === 'fulfilled') {
        return { ok: true, ...counters, terminalStatus: 'fulfilled' };
      }
      return { ok: false, reason: `race_unresolved_${terminal}`, ...counters };
    }
  }

  // 2. Capture via PayPal — exactly one worker reaches here per order
  //    (the claim owner holding 'capturing'). PayPal dedupes captures
  //    per order as a backstop; the state machine is the primary guard.
  let cap: FlowCapture;
  try {
    counters.captureCalls++;
    cap = await captureOrder(orderId);
  } catch (err) {
    // Capture call threw (outcome unknown). Release the lease so a
    // buyer retry re-attempts instead of polling a stuck 'capturing'
    // row — PayPal dedupes captures per order, so a retry's POST
    // returns the existing capture (no double-charge). (Peer 74760d84.)
    log(
      '[paypal/capture] capture call failed',
      orderId,
      err instanceof Error ? err.message : String(err)
    );
    await releaseCaptureLease(admin, orderId);
    return { ok: false, reason: 'capture_failed', ...counters };
  }
  if (!cap || cap.status !== 'COMPLETED') {
    // No COMPLETED capture: no money moved. Release the lease for retry.
    log('[paypal/capture] capture not completed', orderId, cap?.status);
    await releaseCaptureLease(admin, orderId);
    return { ok: false, reason: 'capture_incomplete', ...counters };
  }

  // 3. Durable 'captured' (+capture_id) BEFORE the amount check.
  //    Independent-review hardening: the persist result is CHECKED — a
  //    failed/zero-row persist after a completed capture fails closed
  //    to operator reconciliation rather than fulfilling on an
  //    unrecorded capture.
  if (!(await markCaptured(admin, orderId, cap.id))) {
    log(
      '[paypal/capture] capture completed but markCaptured failed — operator reconciliation required',
      orderId,
      cap.id
    );
    await markFailed(admin, orderId, 'capture_mark_failed');
    return { ok: false, reason: 'capture_mark_failed', ...counters };
  }

  // 4. Server-side amount verification against server truth. Mismatch →
  //    terminal failure: money WAS captured, so fulfillment must not
  //    proceed; the row keeps the capture id for operator refund via
  //    the PayPal dashboard. Never silent, never auto-retried.
  if (!amountsMatch(cap, expected, toPayPalValue)) {
    log(
      '[paypal/capture] AMOUNT MISMATCH — captured but not fulfilled',
      orderId,
      `captured=${cap.amountValue} ${cap.amountCurrency}`,
      `expected=${toPayPalValue(expected.expectedCents)} ${expected.currency}`
    );
    await markFailed(admin, orderId, 'amount_mismatch');
    return { ok: false, reason: 'amount_mismatch', ...counters };
  }

  // 5. Take fulfillment ownership ('recovering') BEFORE fulfill — this
  //    closes the owner/recovery double-fulfill race: a duplicate that
  //    arrives while the owner is fulfilling sees 'recovering' and
  //    polls instead of entering recovery itself.
  if (!(await tryBeginRecovery(admin, orderId))) {
    return resolveRacedRecovery(admin, orderId, log, counters, pollDelayMs);
  }
  try {
    await fulfill(fulfillArgs(custom, orderId, cap.id, expected, description));
  } catch (err) {
    // LOUD (P1-2 doctrine): never console.error-and-continue. The
    // operator reconciles via the paypal_orders row + the PayPal
    // dashboard; the row is terminal so no retry double-fulfills.
    log(
      '[paypal/capture] FULFILLMENT FAILED — manual reconciliation required',
      orderId,
      err instanceof Error ? err.message : String(err)
    );
    await markFailed(admin, orderId, 'fulfill_failed');
    return { ok: false, reason: 'fulfill_failed', ...counters };
  }
  counters.fulfillCalls++;
  if (await tryMarkRecovered(admin, orderId)) {
    return { ok: true, ...counters, terminalStatus: 'fulfilled' };
  }
  return resolveRacedRecovery(admin, orderId, log, counters, pollDelayMs);
}
