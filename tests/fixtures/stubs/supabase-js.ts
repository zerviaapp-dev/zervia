/**
 * Test-only stub for `@supabase/supabase-js` (Nov 2, 2026 bulk-fix).
 *
 * The package is not installed in this repo (only @supabase/ssr is a
 * dependency); tests that import lib modules pulling in
 * `@/lib/supabase/admin` inject a fake admin, so this stub must never
 * actually run. It exists solely so the `@/` alias resolver has a
 * concrete target.
 */
export function createClient(): never {
  throw new Error('@supabase/supabase-js stub: tests must inject a fake admin');
}

export default { createClient };
