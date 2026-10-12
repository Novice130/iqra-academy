/**
 * @fileoverview Drizzle ORM Client for a long-lived Node.js server
 *
 * 📚 POSTGRES.JS DRIVER:
 * The app runs as an ordinary Node process (`next start` on a VPS), so it
 * talks to Postgres over plain TCP with `postgres` (postgres.js) — no
 * WebSocket tunnel, no HTTP driver. Nothing here is Neon-specific: pointing
 * `DATABASE_URL` at another Postgres is the whole migration.
 *
 * 📚 WHY ONE PROCESS-WIDE POOL:
 * A Node server keeps its sockets between requests, so a single pool created
 * once and shared by every request is both correct and the cheap option — the
 * TLS handshake is paid per connection, not per request. The client is built
 * lazily on first use (never at import time, because `next build` imports
 * these modules with no database to reach) and cached on `globalThis` so
 * `next dev` hot reloads re-use it instead of leaking a pool per edit.
 *
 * `prepare: false` because the production URL is Neon's pooled endpoint
 * (PgBouncer in transaction mode), where a prepared statement does not
 * outlive the transaction that created it.
 *
 * 📚 `withDb()` / `withHttpDb()`:
 * These used to hand each request its own connection — a WebSocket pool or
 * an HTTP client — and choosing wrongly was a runtime error. Both are now
 * pass-throughs kept so the existing call sites stay as they are;
 * `db.transaction(...)` works inside either, and outside both.
 *
 * @module lib/db
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

// Node gives each resolved address 250ms to connect before trying the next,
// and the database host resolves to several. From a link slower than that —
// a laptop a continent away from the database is ~270ms — every attempt is
// abandoned and the connect fails with ETIMEDOUT though the host is reachable.
setDefaultAutoSelectFamilyAttemptTimeout(2000);

const globalForDb = globalThis as unknown as {
  __dbClient?: ReturnType<typeof postgres>;
  __db?: Db;
};

function currentDb(): Db {
  if (!globalForDb.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set — the database cannot be reached.");
    }
    const client = postgres(url, {
      max: Number(process.env.DB_POOL_MAX) || 10,
      prepare: false,
      // Seconds. Idle sockets are dropped before Neon's pooler drops them,
      // and a one-off script is not held open after its last query.
      idle_timeout: 20,
      connect_timeout: 10,
    });
    globalForDb.__dbClient = client;
    globalForDb.__db = drizzle(client, { schema });
  }
  return globalForDb.__db;
}

/**
 * Compatibility wrapper from the per-request-pool era: route handlers and
 * server component pages are wrapped in this, and it now simply runs `fn`
 * against the shared pool.
 */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

/**
 * Compatibility wrapper, identical to `withDb`. It used to select a driver
 * without transactions; there is one driver now and it has them.
 */
export async function withHttpDb<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, _receiver) {
    const real = currentDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as Db;

/**
 * RLS context — sets Postgres session variables for Row-Level Security.
 */
export async function withRLS<T>(
  ctx: { userId: string; orgId: string; role: string },
  fn: (tx: Db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${ctx.orgId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.current_role', ${ctx.role}, true)`
    );

    return fn(tx as unknown as Db);
  });
}
