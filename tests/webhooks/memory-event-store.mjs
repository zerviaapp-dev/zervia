/**
 * In-memory EventStore for the repair-branch tests.
 *
 * Implements the SAME interface as lib/webhooks/durable-events.ts
 * (repaired Nov 1, 2026): atomic claim (mutex-serialized, standing in
 * for the Postgres row lock), lease CAS, effect ownership fencing.
 * Uses the REAL isClaimEligible / backoffMs from the compiled module.
 *
 * Failure injection hooks (opts.inject):
 *   - effectDoneFails: number — next N recordEffectDone calls throw
 *     WITHOUT writing (simulates a crash between the external response
 *     and the ledger write).
 *   - effectDoneFlaky: number — next N recordEffectDone calls throw
 *     transient errors (then succeed) to prove bounded retry recovery.
 */
import {
  isClaimEligible,
  backoffMs,
} from './dist/webhooks/durable-events.js';

export function createMemoryEventStore(opts = {}) {
  const inject = opts.inject ?? {};
  const events = new Map(); // event_id -> EventRow
  const effects = new Map(); // effect_key -> EffectRow
  let mutex = Promise.resolve();
  const locked = (fn) => {
    const run = mutex.then(fn, fn);
    mutex = run.catch(() => {});
    return run;
  };

  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);

  return {
    inject,
    _events: events,
    _effects: effects,

    async register(eventId, eventType) {
      return locked(() => {
        let row = events.get(eventId);
        if (!row) {
          row = {
            event_id: eventId,
            event_type: eventType,
            state: 'received',
            lease_token: null,
            lease_expires_at: null,
            attempts: 0,
            retryable: true,
            next_attempt_at: null,
            last_error: null,
            legacy: false,
          };
          events.set(eventId, row);
        }
        return clone(row);
      });
    },

    async claim(eventId, leaseToken, leaseMs, workerId, nowMs) {
      return locked(() => {
        const row = events.get(eventId);
        if (!row) return { claimed: false, prevState: null, attempts: 0 };
        const prevState = row.state;
        if (!isClaimEligible(row, nowMs)) {
          return { claimed: false, prevState, attempts: row.attempts };
        }
        row.state = 'claimed';
        row.lease_token = leaseToken;
        row.lease_expires_at = new Date(nowMs + leaseMs).toISOString();
        row.attempts += 1;
        row.worker_id = workerId;
        return { claimed: true, prevState, attempts: row.attempts };
      });
    },

    async beginProcessing(eventId, leaseToken) {
      return locked(() => {
        const row = events.get(eventId);
        if (!row || row.state !== 'claimed' || row.lease_token !== leaseToken) return false;
        row.state = 'processing';
        return true;
      });
    },

    async complete(eventId, leaseToken) {
      return locked(() => {
        const row = events.get(eventId);
        if (!row || row.state !== 'processing' || row.lease_token !== leaseToken) return false;
        row.state = 'completed';
        row.lease_token = null;
        return true;
      });
    },

    async fail(eventId, leaseToken, retryable, error, nowMs) {
      return locked(() => {
        const row = events.get(eventId);
        if (!row || row.state !== 'processing' || row.lease_token !== leaseToken) return false;
        row.state = 'failed';
        row.lease_token = null;
        row.retryable = retryable;
        row.next_attempt_at = retryable
          ? new Date(nowMs + backoffMs(row.attempts)).toISOString()
          : null;
        row.last_error = String(error).slice(0, 500);
        return true;
      });
    },

    async renewLease(eventId, leaseToken, leaseMs, nowMs) {
      return locked(() => {
        const row = events.get(eventId);
        if (
          !row ||
          (row.state !== 'claimed' && row.state !== 'processing') ||
          row.lease_token !== leaseToken ||
          !row.lease_expires_at ||
          Date.parse(row.lease_expires_at) <= nowMs
        ) {
          return false;
        }
        row.lease_expires_at = new Date(nowMs + leaseMs).toISOString();
        return true;
      });
    },

    async getEffect(effectKey) {
      return clone(effects.get(effectKey) ?? null);
    },

    async recordEffectStart(effectKey, eventId, effectName, ownerToken, idempotencyKey = null, correlationId = null) {
      return locked(() => {
        if (effects.has(effectKey)) return false; // fencing: never overwrite
        effects.set(effectKey, {
          effect_key: effectKey,
          event_id: eventId,
          effect_name: effectName,
          status: 'started',
          external_id: null,
          attempts: 1,
          last_error: null,
          owner_token: ownerToken,
          failure_kind: null,
          idempotency_key: idempotencyKey,
          correlation_id: correlationId,
        });
        return true;
      });
    },

    async recordEffectDone(effectKey, externalId, ownerToken) {
      return locked(() => {
        if (inject.effectDoneFails > 0) {
          inject.effectDoneFails -= 1;
          // Crash: the write never lands.
          throw new Error('SIMULATED_CRASH: recordEffectDone write lost');
        }
        if (inject.effectDoneFlaky > 0) {
          inject.effectDoneFlaky -= 1;
          throw new Error('transient ledger unavailable');
        }
        const row = effects.get(effectKey);
        if (!row || row.owner_token !== ownerToken) return false; // stale worker CAS miss
        if (row.status !== 'started' && row.status !== 'failed') return false;
        row.status = 'completed';
        row.external_id = externalId;
        return true;
      });
    },

    async recordEffectFailed(effectKey, error, ownerToken, failureKind) {
      return locked(() => {
        const row = effects.get(effectKey);
        if (!row || row.owner_token !== ownerToken) return false;
        if (row.status !== 'started' && row.status !== 'failed') return false;
        row.status = 'failed';
        row.failure_kind = failureKind;
        row.last_error = String(error).slice(0, 500);
        row.attempts += 1;
        return true;
      });
    },

    async recordEffectAmbiguous(effectKey, error, ownerToken) {
      return locked(() => {
        const row = effects.get(effectKey);
        if (!row || row.owner_token !== ownerToken) return false;
        if (row.status !== 'started' && row.status !== 'failed') return false;
        row.status = 'ambiguous';
        row.failure_kind = 'unknown';
        row.last_error = String(error).slice(0, 500);
        row.attempts += 1;
        return true;
      });
    },

    /** Test-only: force a lease to expire. */
    expireLease(eventId, nowMs) {
      const row = events.get(eventId);
      if (row) row.lease_expires_at = new Date(nowMs - 1000).toISOString();
    },
  };
}
