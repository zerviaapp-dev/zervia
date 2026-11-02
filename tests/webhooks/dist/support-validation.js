"use strict";
/**
 * Support-message body validation (Nov 1, 2026 — repair branch).
 *
 * Pure, dependency-free module so the malformed-body guards are unit
 * testable under node --test (the Next.js route at
 * app/api/support/route.ts delegates to this). P1-4: the old route
 * called .trim() on unguarded fields — a JSON null body made
 * body.name throw (500), and a non-string field like {"name": 123}
 * made (123 ?? '').trim() throw (500). Every field is now type-
 * guarded BEFORE any string method runs; malformed bodies get a 400
 * with a clear error, never a 500.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSupportBody = validateSupportBody;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const VALID_TOPICS = [
    'general',
    'account',
    'booking',
    'provider',
    'trust',
    'match',
    'service-request',
];
function fail(error) {
    return { ok: false, error };
}
/**
 * Validate a parsed JSON body for POST /api/support.
 * Never throws on malformed input — returns { ok: false, error }.
 */
function validateSupportBody(body) {
    // Object guard: null, arrays, and primitives are rejected before any
    // property access.
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return fail('Invalid request body.');
    }
    const b = body;
    // String guards: non-string fields degrade to '' (then fail the
    // presence check with a 400) instead of throwing on .trim().
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : '';
    if (!name) {
        return fail('Please enter your name.');
    }
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) {
        return fail('Please enter a valid email address.');
    }
    const topic = typeof b.topic === 'string' ? b.topic.trim() : 'general';
    if (!VALID_TOPICS.includes(topic)) {
        return fail('Invalid topic.');
    }
    const message = typeof b.message === 'string' ? b.message.trim().slice(0, 5000) : '';
    if (!message) {
        return fail('Please write your message.');
    }
    return { ok: true, value: { name, email, topic, message } };
}
