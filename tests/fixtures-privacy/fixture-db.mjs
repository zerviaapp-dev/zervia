/**
 * fixture-db.mjs — credential-free in-memory Supabase-shaped adapter.
 *
 * Implements the SAME data-access interface the Zervia ownership checks use:
 *   db.auth.getUser()
 *   db.from(table).select(cols).eq(col, val)[.eq(...)].single() / .maybeSingle()
 *   db.from(table).update(patch).eq(col, val)[.eq(...)]            (awaitable)
 *   db.from(table).insert(row)
 *   db.from(table).delete().eq(col, val)                          (awaitable)
 *
 * Plus a tiny join parser for PostgREST embeds like
 *   'providers!inner(user_id, completed_jobs)'
 *
 * There is deliberately NO RLS in this adapter: the ownership policy under
 * test (policy.mjs) performs the explicit provider_id / user_id comparisons
 * the code must do BEFORE any debit or write. RLS itself is a real-Supabase
 * concern and is listed as such in the readiness-route doc.
 *
 * An op log records every executed query so tests can assert ORDERING
 * (e.g. ownership compare happens before any ledger debit).
 */
import { randomUUID } from 'node:crypto';

export function seedFixtures() {
  return {
    users: [
      { id: 'user-alice', email: 'alice@example.com' },
      { id: 'user-bob', email: 'bob@example.com' },
      { id: 'user-carol', email: 'carol@example.com' },
    ],
    providers: [
      { id: 'prov-alice', user_id: 'user-alice', business_name: 'Alice Plumbing', completed_jobs: 12, provider_tier: 'verified' },
      { id: 'prov-bob', user_id: 'user-bob', business_name: 'Bob Electrical', completed_jobs: 12, provider_tier: 'verified' },
      { id: 'prov-carol', user_id: 'user-carol', business_name: 'Carol Gardens', completed_jobs: 3, provider_tier: 'verified' },
    ],
    listings: [
      {
        id: 'list-alice-1', provider_id: 'prov-alice',
        title: 'Emergency plumbing', city: 'Calgary', country: 'Canada',
        latitude: 51.04473, longitude: -114.07191, // exact GPS pin (private)
        is_featured: false, featured_until: null, status: 'active',
      },
      {
        id: 'list-bob-1', provider_id: 'prov-bob',
        title: 'Panel upgrades', city: 'Edmonton', country: 'Canada',
        latitude: 53.54612, longitude: -113.49382,
        is_featured: false, featured_until: null, status: 'active',
      },
      {
        id: 'list-carol-1', provider_id: 'prov-carol',
        title: 'Garden design', city: 'Red Deer', country: 'Canada',
        latitude: 52.26811, longitude: -113.81124,
        is_featured: false, featured_until: null, status: 'active',
      },
    ],
    points_ledger: [
      { id: randomUUID(), user_id: 'user-alice', delta: 1500, reason: 'signup', reference_id: null },
      { id: randomUUID(), user_id: 'user-bob', delta: 1500, reason: 'signup', reference_id: null },
      { id: randomUUID(), user_id: 'user-carol', delta: 1500, reason: 'signup', reference_id: null },
    ],
    checkout_sessions: [],
  };
}

function splitTopLevel(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const JOIN_RE = /^(\w+)!inner\(([^)]+)\)$/;

export function createFixtureDb(seed, { asUserId = null, opLog = null } = {}) {
  const tables = seed;

  function log(op) { if (opLog) opLog.push(op); }

  function applyJoins(row, table, cols) {
    const out = { ...row };
    for (const token of splitTopLevel(cols)) {
      const m = token.match(JOIN_RE);
      if (!m) continue;
      const [, joinTable, joinCols] = m;
      // listings.provider_id -> providers.id (the only join the policy uses)
      const fk = table === 'listings' && joinTable === 'providers' ? 'provider_id' : null;
      if (!fk) continue;
      const related = (tables[joinTable] || []).find((r) => r.id === row[fk]) || null;
      const picked = {};
      if (related) for (const c of joinCols.split(',').map((s) => s.trim())) picked[c] = related[c];
      out[joinTable] = related ? picked : null;
    }
    return out;
  }

  function project(row, table, cols) {
    if (!cols || cols.trim() === '*' || cols.trim() === '') return { ...row };
    const out = {};
    for (const token of splitTopLevel(cols)) {
      const m = token.match(JOIN_RE);
      if (m) { Object.assign(out, applyJoins(row, table, token)); continue; }
      out[token] = row[token];
    }
    // keep any already-attached join payload
    return out;
  }

  class Query {
    constructor(table) { this.table = table; this.filters = []; this.cols = '*'; this.mode = 'select'; this.patch = null; this.row = null; }
    select(cols) { this.mode = 'select'; this.cols = cols; return this; }
    eq(col, val) { this.filters.push([col, val]); return this; }
    update(patch) { this.mode = 'update'; this.patch = patch; return this; }
    insert(row) { this.mode = 'insert'; this.row = row; return this.execute(); }
    delete() { this.mode = 'delete'; return this; }
    matches(r) { return this.filters.every(([c, v]) => r[c] === v); }
    rows() { return (tables[this.table] || []).filter((r) => this.matches(r)); }
    async execute() {
      const { mode, table } = this;
      log({ op: mode, table, filters: this.filters.map(([c, v]) => `${c}=${v}`) });
      if (mode === 'insert') {
        const row = { id: this.row.id ?? randomUUID(), ...this.row };
        tables[table].push(row);
        return { data: row, error: null };
      }
      if (mode === 'update') {
        const hits = this.rows();
        for (const r of hits) Object.assign(r, this.patch);
        return { data: hits, error: null };
      }
      if (mode === 'delete') {
        const before = tables[table].length;
        tables[table] = tables[table].filter((r) => !this.matches(r));
        return { data: null, error: null, count: before - tables[table].length };
      }
      return { data: this.rows().map((r) => project(r, table, this.cols)), error: null };
    }
    async single() {
      const { data } = await this.execute();
      if (data.length !== 1) return { data: null, error: { message: 'no rows', code: 'PGRST116' } };
      return { data: data[0], error: null };
    }
    async maybeSingle() {
      const { data } = await this.execute();
      if (data.length > 1) return { data: null, error: { message: 'multiple rows' } };
      return { data: data[0] ?? null, error: null };
    }
    then(res, rej) { return this.execute().then(res, rej); }
  }

  return {
    opLog,
    auth: {
      async getUser() {
        const user = (tables.users || []).find((u) => u.id === asUserId) || null;
        return { data: { user }, error: user ? null : { message: 'no session' } };
      },
    },
    from(table) { return new Query(table); },
    __tables: tables,
  };
}

export function pointsBalance(db, userId) {
  return db.__tables.points_ledger
    .filter((r) => r.user_id === userId)
    .reduce((s, r) => s + Number(r.delta || 0), 0);
}
