/**
 * Registers the @/ alias + @supabase/supabase-js stub resolver for
 * Node's built-in test runner (Nov 2, 2026 bulk-fix).
 *
 * Usage:
 *   node --experimental-strip-types --import ./tests/hooks/register-alias.mjs \
 *     --test tests/paypal-loud-ledger.test.mjs
 *
 * Lets .mjs tests import the TypeScript SOURCES directly (no tsc
 * compile step, no absolute /tmp paths — runs on any checkout).
 */
import { register } from 'node:module';

register('./resolve-alias.mjs', import.meta.url);
