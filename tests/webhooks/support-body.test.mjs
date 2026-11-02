/**
 * Support-body validation tests (repair branch, Nov 1, 2026).
 *
 * These close P1-4: the old /api/support route called .trim() on
 * unguarded fields — a JSON null body made body.name throw (500), and
 * a non-string field like {"name": 123} made (123 ?? '').trim() throw
 * (500). The route now delegates to the pure, unit-testable
 * validateSupportBody (lib/support-validation.ts, compiled below);
 * every malformed body maps to a 400 with a clear error — never a 500.
 *
 * Synthetic fixtures only. No network, no database, no PII.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSupportBody } from './dist/support-validation.js';

const VALID = {
  name: '  Test User  ',
  email: '  TEST@Example.COM ',
  topic: 'booking',
  message: '  Hello, I need help.  ',
};

test('null body -> 400-style error, never throws', async () => {
  const r = validateSupportBody(null);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Invalid request body.');
});

test('non-object bodies -> 400-style error, never throws', async () => {
  for (const bad of ['x', 42, true, ['name']]) {
    const r = validateSupportBody(bad);
    assert.equal(r.ok, false, `expected failure for ${JSON.stringify(bad)}`);
    assert.equal(r.error, 'Invalid request body.');
  }
});

test('empty object -> asks for name (missing fields are 400, not 500)', async () => {
  const r = validateSupportBody({});
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Please enter your name.');
});

test('non-string name ({"name": 123}) -> 400, never throws', async () => {
  // The old route did (123 ?? '').trim() -> TypeError -> 500.
  const r = validateSupportBody({ ...VALID, name: 123 });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Please enter your name.');
});

test('non-string email -> invalid email, never throws', async () => {
  const r = validateSupportBody({ ...VALID, email: 123 });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Please enter a valid email address.');
});

test('non-string message -> asks for message, never throws', async () => {
  const r = validateSupportBody({ ...VALID, message: { text: 'hi' } });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Please write your message.');
});

test('non-string topic degrades to general (no throw)', async () => {
  const r = validateSupportBody({ ...VALID, topic: 123 });
  assert.equal(r.ok, true);
  assert.equal(r.value.topic, 'general');
});

test('bad topic -> invalid topic', async () => {
  const r = validateSupportBody({ ...VALID, topic: 'bogus' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Invalid topic.');
});

test('missing topic defaults to general', async () => {
  const { topic, ...rest } = VALID;
  const r = validateSupportBody(rest);
  assert.equal(r.ok, true);
  assert.equal(r.value.topic, 'general');
});

test('valid body -> ok with trimmed and normalized values', async () => {
  const r = validateSupportBody(VALID);
  assert.equal(r.ok, true);
  assert.equal(r.value.name, 'Test User');
  assert.equal(r.value.email, 'test@example.com');
  assert.equal(r.value.topic, 'booking');
  assert.equal(r.value.message, 'Hello, I need help.');
});

test('name and message are length-capped', async () => {
  const r = validateSupportBody({
    ...VALID,
    name: 'n'.repeat(200),
    message: 'm'.repeat(6000),
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.name.length, 120);
  assert.equal(r.value.message.length, 5000);
});
