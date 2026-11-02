"use strict";
/**
 * Duplicate-safe billing ledger (Nov 1, 2026 — repair branch
 * `lizzie/zervia-repair-2026-11-01`, from main@40647a81).
 *
 * Answers the independent review's ledger findings (#6555289723 2am HOLD,
 * #6557697448 morning review):
 *
 * 1. The old route's `recordTransaction` swallowed insert failures with
 *    `console.error` and no throw — "that contradicts the claimed
 *    ledger-write transaction guarantee". This module THROWS on every
 *    insert failure. Never silent.
 * 2. Idempotency key design (per the morning review): provider +
 *    environment + merchant/account scope + stable BUSINESS EFFECT
 *    identity (effect type + provider effect id, e.g. capture/refund id).
 *    The provider webhook event id deduplicates RECEIPT, but alone does
 *    not deduplicate the same business effect delivered through different
 *    events — so both are stored: `stripe_event_id` (correlation) and
 *    `effect_key` (uniqueness). Refunds stay distinct from captures
 *    because the effect type is part of the key.
 * 3. Repeat-payload consistency is VERIFIED: on a unique-conflict the
 *    existing row is compared field-by-field; a mismatch throws
 *    `LedgerConflictError` (non-retryable — a human reconciles) instead
 *    of silently accepting divergent money rows.
 *
 * Schema (migration 20261101000000_webhook_events.sql, UNAPPLIED):
 *   transactions.effect_key text, UNIQUE (effect_key) WHERE effect_key IS NOT NULL
 *
 * The `LedgerAdmin` structural interface keeps this testable without a
 * database; the real service-role supabase-js client satisfies it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerConflictError = void 0;
exports.ledgerEffectKey = ledgerEffectKey;
exports.recordTransaction = recordTransaction;
/**
 * Build the business effect key. Format:
 *   zervia:v1:{provider}:{test|live}:{merchantScope}:{effectType}:{providerEffectId}
 * Refunds remain distinct from captures: the effect type differs
 * ('refund' vs 'subscription'/'product_order') AND the provider effect
 * id differs (refund id vs charge/payment-intent id).
 */
function ledgerEffectKey(parts) {
    const safe = (s) => s.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
    return [
        'zervia',
        'v1',
        parts.provider,
        parts.testMode ? 'test' : 'live',
        safe(parts.merchantScope),
        parts.effectType,
        safe(parts.providerEffectId),
    ].join(':');
}
/**
 * Thrown when a duplicate effect key arrives with INCONSISTENT money
 * fields. Non-retryable: identical retries can never fix divergent
 * amounts — a human reconciles via the manual-review queue.
 */
class LedgerConflictError extends Error {
    effectKey;
    existing;
    incoming;
    constructor(effectKey, existing, incoming) {
        super(`ledger conflict on effect_key ${effectKey}: duplicate delivery with ` +
            `inconsistent money fields — human reconciliation required`);
        this.name = 'LedgerConflictError';
        this.effectKey = effectKey;
        this.existing = existing;
        this.incoming = incoming;
    }
}
exports.LedgerConflictError = LedgerConflictError;
function isUniqueViolation(error) {
    return !!error && error.code === '23505';
}
/**
 * Record a ledger row EXACTLY once per business effect.
 *
 * - Insert failure (non-conflict): THROWS. Callers must treat this as a
 *   failed event (retryable 500) — the guarded fulfillment transitions
 *   make redelivery idempotent.
 * - Unique conflict on effect_key: the row already exists. Its money
 *   fields are compared; consistent → the existing row is returned
 *   (idempotent success, NO second credit); inconsistent →
 *   LedgerConflictError (non-retryable, manual review).
 */
async function recordTransaction(admin, row) {
    const payload = {
        user_id: row.user_id,
        provider_id: row.provider_id ?? null,
        effect_key: row.effect_key,
        stripe_event_id: row.stripe_event_id ?? null,
        stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
        stripe_invoice_id: row.stripe_invoice_id ?? null,
        stripe_checkout_session_id: row.stripe_checkout_session_id ?? null,
        amount_cents: row.amount_cents,
        currency: row.currency ?? 'cad',
        type: row.type,
        status: row.status,
        description: row.description ?? null,
    };
    const { data, error } = await admin.from('transactions').insert(payload).select('id');
    if (!error) {
        const first = Array.isArray(data) ? data[0] : null;
        return {
            ...row,
            id: String(first?.id ?? ''),
            currency: row.currency ?? 'cad',
            created_at: new Date().toISOString(),
        };
    }
    if (!isUniqueViolation(error)) {
        // LOUD: ledger failures propagate, never console.error-and-continue.
        throw new Error(`[ledger] transaction insert failed for ${row.effect_key}: ${error.message}`);
    }
    // Duplicate delivery of the same business effect: verify consistency.
    const { data: existingData, error: selError } = await admin
        .from('transactions')
        .select('id,user_id,provider_id,effect_key,amount_cents,currency,type,status')
        .eq('effect_key', row.effect_key)
        .maybeSingle();
    if (selError || !existingData) {
        throw new Error(`[ledger] duplicate effect_key ${row.effect_key} but existing row unreadable: ${selError?.message ?? 'no row'}`);
    }
    const existing = existingData;
    const consistent = Number(existing.amount_cents) === row.amount_cents &&
        String(existing.currency ?? 'cad').toLowerCase() === (row.currency ?? 'cad').toLowerCase() &&
        String(existing.type) === row.type &&
        String(existing.user_id) === row.user_id;
    if (!consistent) {
        throw new LedgerConflictError(row.effect_key, existing, payload);
    }
    return {
        ...row,
        id: String(existing.id ?? ''),
        currency: String(existing.currency ?? row.currency ?? 'cad'),
        created_at: new Date().toISOString(),
    };
}
