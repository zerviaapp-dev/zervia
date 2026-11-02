/**
 * Module customization hooks: resolves the repo's `@/` path alias and
 * stubs `@supabase/supabase-js` (not installed; tests inject a fake
 * admin so the stub never runs).
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HOOKS_DIR, '..', '..');
const SUPABASE_STUB = path.join(REPO, 'tests', 'fixtures', 'stubs', 'supabase-js.ts');

function tryResolve(base) {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@supabase/supabase-js') {
    return { url: pathToFileURL(SUPABASE_STUB).href, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const resolved = tryResolve(path.join(REPO, specifier.slice(2)));
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
