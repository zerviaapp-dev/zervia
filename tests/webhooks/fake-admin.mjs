/**
 * Minimal in-memory supabase-js-shaped client for the actual-route
 * regression tests. Supports exactly the query surface the repaired
 * handler uses: select/insert/update/upsert + eq filters + maybeSingle /
 * single + thenable terminal chains.
 *
 * Failure injection (opts.inject):
 *   - ledgerInsertFails: number — next N transactions inserts throw
 *     WITHOUT writing (simulates a DB outage on the ledger path).
 */
export function createFakeAdmin(opts = {}) {
  const inject = opts.inject ?? {};
  const tables = new Map(); // table -> Map(id -> row)
  const seq = { n: 0 };
  const newId = (t) => `${t}_${++seq.n}`;

  const table = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };

  const matches = (row, filters) => filters.every(([c, v]) => row[c] === v);

  function seed(tableName, rows) {
    const t = table(tableName);
    for (const r of rows) t.set(r.id ?? newId(tableName), { ...r, id: r.id ?? newId(tableName) });
  }

  function upsertKey(tableName, row, onConflict) {
    if (tableName === 'escrow_payments' && onConflict === 'booking_id') return ['booking_id', row.booking_id];
    if (tableName === 'subscriptions' && onConflict === 'provider_id') return ['provider_id', row.provider_id];
    if (tableName === 'digital_entitlements' && onConflict === 'user_id,product_slug')
      return ['user_id|product_slug', `${row.user_id}|${row.product_slug}`];
    return ['id', row.id ?? newId(tableName)];
  }

  function makeBuilder(tableName, op, payload, optsUpsert) {
    const filters = [];
    let selectCols = null;
    const builder = {
      eq(col, val) {
        filters.push([col, val]);
        return builder;
      },
      select(cols) {
        selectCols = cols;
        return builder;
      },
      async maybeSingle() {
        const t = table(tableName);
        const hit = [...t.values()].find((r) => matches(r, filters)) ?? null;
        return { data: hit ? { ...hit } : null, error: null };
      },
      async single() {
        const t = table(tableName);
        const hit = [...t.values()].find((r) => matches(r, filters)) ?? null;
        if (!hit) return { data: null, error: { message: 'No rows', code: 'PGRST116' } };
        return { data: { ...hit }, error: null };
      },
      then(onF, onR) {
        return exec().then(onF, onR);
      },
    };

    async function exec() {
      const t = table(tableName);
      if (op === 'update') {
        const rows = [...t.values()].filter((r) => matches(r, filters));
        for (const r of rows) Object.assign(r, payload);
        return { data: rows.map((r) => ({ ...r })), error: null };
      }
      if (op === 'insert') {
        if (tableName === 'transactions') {
          if (inject.ledgerInsertFails > 0) {
            inject.ledgerInsertFails -= 1;
            throw new Error('SIMULATED_DB_OUTAGE: transactions insert failed');
          }
          if (payload.effect_key) {
            const dup = [...t.values()].find((r) => r.effect_key === payload.effect_key);
            if (dup) {
              return { data: null, error: { message: 'duplicate key value violates unique constraint "transactions_effect_key_uidx"', code: '23505' } };
            }
          }
        }
        const row = { ...payload, id: payload.id ?? newId(tableName) };
        t.set(row.id, row);
        return { data: [row], error: null };
      }
      if (op === 'upsert') {
        const [kc, kv] = upsertKey(tableName, payload, optsUpsert?.onConflict);
        const key = kc === 'id' ? (payload.id ?? newId(tableName)) : kv;
        const storeKey = kc === 'id' ? key : `${kc}:${kv}`;
        // For non-id upserts keep a secondary lookup by scanning.
        let existing = null;
        if (kc === 'id') existing = t.get(key) ?? null;
        else existing = [...t.values()].find((r) => String(r[kc.split('|')[0]] ?? '') + '|' + String(r[kc.split('|')[1]] ?? '') === String(kv) || r[kc] === kv) ?? null;
        if (existing && optsUpsert?.ignoreDuplicates) {
          return { data: [], error: null };
        }
        if (existing) {
          Object.assign(existing, payload);
          return { data: [{ ...existing }], error: null };
        }
        const row = { ...payload, id: payload.id ?? newId(tableName) };
        t.set(kc === 'id' ? row.id : storeKey, row);
        return { data: [row], error: null };
      }
      return { data: null, error: { message: `unsupported op ${op}`, code: 'XX000' } };
    }
    return builder;
  }

  const admin = {
    inject,
    _tables: tables,
    seed,
    from(tableName) {
      return {
        select: (cols) => makeBuilder(tableName, 'select', null),
        insert: (row) => makeBuilder(tableName, 'insert', row),
        update: (row) => makeBuilder(tableName, 'update', row),
        upsert: (row, o) => makeBuilder(tableName, 'upsert', row, o),
      };
    },
    /** Count rows in a table (test assertions). */
    count(tableName) {
      return table(tableName).size;
    },
    /** All rows of a table (test assertions). */
    all(tableName) {
      return [...table(tableName).values()].map((r) => ({ ...r }));
    },
  };
  return admin;
}
