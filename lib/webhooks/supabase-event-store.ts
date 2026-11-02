/**
 * Postgres implementation of EventStore via the webhook_* RPCs shipped in
 * supabase/migrations/20261101000000_webhook_events.sql (REVISED Nov 1,
 * 2026 — repair branch).
 *
 * Every state transition is a single RPC call: the claim, completion and
 * failure paths are atomic at the database (row lock + re-evaluated
 * predicate), so concurrent deliveries cannot double-claim. Effect
 * transitions are compare-and-set on (effect_key, owner_token) so a
 * stale worker cannot complete/fail an effect owned by the redrive
 * worker.
 *
 * NOTE: the migration is UNAPPLIED (separate review; no production
 * migration authorized). This adapter is reviewed code, not executed
 * against any database tonight. The executed evidence is the in-memory
 * store + the actual-route regression suite (node --test).
 */

import type {
  ClaimResult,
  EffectFailureKind,
  EffectRow,
  EffectStatus,
  EventRow,
  EventState,
  EventStore,
} from './durable-events';

type DbError = { message: string } | null;
type DbResult = { data: unknown; error: DbError };

/** Minimal structural type for the service-role Supabase client. */
export interface AdminClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<DbResult>;
  from(table: string): QueryTable;
}

export interface QueryTable {
  select(cols?: string): QueryChain;
  insert(row: Record<string, unknown>): QueryChain;
  update(row: Record<string, unknown>): QueryChain;
  upsert(
    row: Record<string, unknown>,
    opts?: Record<string, unknown>
  ): QueryChain;
}

export interface QueryChain {
  eq(col: string, val: unknown): QueryChain;
  maybeSingle(): Promise<DbResult>;
}

/** Await a thenable supabase-js query builder. */
async function run(chain: QueryChain): Promise<DbResult> {
  return (await (chain as unknown as Promise<DbResult>)) as DbResult;
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return (data[0] as Record<string, unknown>) ?? null;
  return (data as Record<string, unknown>) ?? null;
}

function toEventRow(r: Record<string, unknown>): EventRow {
  return {
    event_id: String(r.event_id),
    event_type: String(r.event_type ?? ''),
    state: (r.state as EventState) ?? 'received',
    lease_token: (r.lease_token as string | null) ?? null,
    lease_expires_at: (r.lease_expires_at as string | null) ?? null,
    attempts: Number(r.attempts ?? 0),
    retryable: Boolean(r.retryable ?? true),
    next_attempt_at: (r.next_attempt_at as string | null) ?? null,
    last_error: (r.last_error as string | null) ?? null,
    legacy: Boolean(r.legacy ?? false),
    legacy_outcome_unknown: Boolean(r.legacy_outcome_unknown ?? false),
  };
}

function toEffectRow(r: Record<string, unknown>): EffectRow {
  return {
    effect_key: String(r.effect_key),
    event_id: String(r.event_id),
    effect_name: String(r.effect_name),
    status: r.status as EffectStatus,
    external_id: (r.external_id as string | null) ?? null,
    attempts: Number(r.attempts ?? 0),
    last_error: (r.last_error as string | null) ?? null,
    owner_token: (r.owner_token as string | null) ?? null,
    failure_kind: (r.failure_kind as EffectFailureKind | null) ?? null,
    idempotency_key: (r.idempotency_key as string | null) ?? null,
    correlation_id: (r.correlation_id as string | null) ?? null,
  };
}

function throwIfDbError(error: DbError, context: string): void {
  if (error) throw new Error(`webhook ${context}: ${error.message}`);
}

export class SupabaseEventStore implements EventStore {
  constructor(private readonly admin: AdminClient) {}

  async register(eventId: string, eventType: string): Promise<EventRow> {
    const { data, error } = await this.admin.rpc('webhook_register', {
      p_event_id: eventId,
      p_event_type: eventType,
    });
    throwIfDbError(error, `register ${eventId}`);
    const row = firstRow(data);
    if (!row) throw new Error(`webhook register ${eventId}: no row returned`);
    return toEventRow(row);
  }

  async claim(
    eventId: string,
    leaseToken: string,
    leaseMs: number,
    workerId: string,
    _nowMs: number
  ): Promise<ClaimResult> {
    const { data, error } = await this.admin.rpc('webhook_claim', {
      p_event_id: eventId,
      p_lease_token: leaseToken,
      p_lease_ms: leaseMs,
      p_worker_id: workerId,
    });
    throwIfDbError(error, `claim ${eventId}`);
    const row = firstRow(data) ?? {};
    return {
      claimed: (row as { claimed?: boolean }).claimed === true,
      prevState:
        ((row as { prev_state?: string | null }).prev_state as EventState | null) ??
        null,
      attempts: Number((row as { attempts?: number }).attempts ?? 0),
    };
  }

  async beginProcessing(eventId: string, leaseToken: string): Promise<boolean> {
    const { data, error } = await this.admin.rpc('webhook_begin_processing', {
      p_event_id: eventId,
      p_lease_token: leaseToken,
    });
    throwIfDbError(error, `begin_processing ${eventId}`);
    // Zero rows returned when the CAS fails (stale worker) -> false.
    return firstRow(data) !== null;
  }

  async complete(eventId: string, leaseToken: string): Promise<boolean> {
    const { data, error } = await this.admin.rpc('webhook_complete', {
      p_event_id: eventId,
      p_lease_token: leaseToken,
    });
    throwIfDbError(error, `complete ${eventId}`);
    return firstRow(data) !== null;
  }

  async fail(
    eventId: string,
    leaseToken: string,
    retryable: boolean,
    errorMsg: string,
    _nowMs: number
  ): Promise<boolean> {
    const { data, error } = await this.admin.rpc('webhook_fail', {
      p_event_id: eventId,
      p_lease_token: leaseToken,
      p_retryable: retryable,
      p_error: errorMsg,
    });
    throwIfDbError(error, `fail ${eventId}`);
    return firstRow(data) !== null;
  }

  async renewLease(
    eventId: string,
    leaseToken: string,
    leaseMs: number,
    _nowMs: number
  ): Promise<boolean> {
    const { data, error } = await this.admin.rpc('webhook_renew_lease', {
      p_event_id: eventId,
      p_lease_token: leaseToken,
      p_lease_ms: leaseMs,
    });
    throwIfDbError(error, `renew_lease ${eventId}`);
    return firstRow(data) !== null;
  }

  async getEffect(effectKey: string): Promise<EffectRow | null> {
    const { data, error } = await this.admin
      .from('webhook_effects')
      .select('*')
      .eq('effect_key', effectKey)
      .maybeSingle();
    throwIfDbError(error, `get_effect ${effectKey}`);
    if (!data) return null;
    return toEffectRow(data as Record<string, unknown>);
  }

  async recordEffectStart(
    effectKey: string,
    eventId: string,
    effectName: string,
    ownerToken: string,
    idempotencyKey?: string | null,
    correlationId?: string | null
  ): Promise<boolean> {
    // Atomic "insert if absent": the RPC returns false when another
    // worker already owns the row (fencing — never overwrite).
    const { data, error } = await this.admin.rpc('webhook_effect_start', {
      p_effect_key: effectKey,
      p_event_id: eventId,
      p_effect_name: effectName,
      p_owner_token: ownerToken,
      p_idempotency_key: idempotencyKey ?? null,
      p_correlation_id: correlationId ?? null,
    });
    throwIfDbError(error, `effect_start ${effectKey}`);
    return firstRow(data)?.started === true;
  }

  async recordEffectDone(
    effectKey: string,
    externalId: string | null,
    ownerToken: string
  ): Promise<boolean> {
    // CAS on (effect_key, owner_token): a stale worker's write misses.
    const { data, error } = await this.admin.rpc('webhook_effect_done', {
      p_effect_key: effectKey,
      p_external_id: externalId,
      p_owner_token: ownerToken,
    });
    throwIfDbError(error, `effect_done ${effectKey}`);
    return firstRow(data)?.updated === true;
  }

  async recordEffectFailed(
    effectKey: string,
    errorMsg: string,
    ownerToken: string,
    failureKind: EffectFailureKind
  ): Promise<boolean> {
    const { data, error } = await this.admin.rpc('webhook_effect_failed', {
      p_effect_key: effectKey,
      p_error: errorMsg.slice(0, 500),
      p_owner_token: ownerToken,
      p_failure_kind: failureKind,
    });
    throwIfDbError(error, `effect_failed ${effectKey}`);
    return firstRow(data)?.updated === true;
  }

  async recordEffectAmbiguous(
    effectKey: string,
    errorMsg: string,
    ownerToken: string
  ): Promise<boolean> {
    const { data, error } = await this.admin.rpc('webhook_effect_ambiguous', {
      p_effect_key: effectKey,
      p_error: errorMsg.slice(0, 500),
      p_owner_token: ownerToken,
    });
    throwIfDbError(error, `effect_ambiguous ${effectKey}`);
    return firstRow(data)?.updated === true;
  }
}
