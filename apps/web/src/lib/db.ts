/**
 * @fileoverview Drizzle ORM Client for Cloudflare Workers & Serverless
 *
 * 📚 NEON SERVERLESS DRIVER:
 * Standard `postgres` TCP drivers do not work in Cloudflare Workers because
 * Workers use `workerd` (V8 edge runtime) which doesn't support raw Node TCP sockets.
 * `@neondatabase/serverless` connects over WebSockets (port 443), providing
 * instant query responses, full transaction support, and zero connection hangs!
 *
 * 📚 WHY PER-REQUEST POOLS:
 * Cloudflare Workers forbids reusing an I/O object (socket, stream) created
 * during one request's execution context from a different request's context
 * ("Cannot perform I/O on behalf of a different request"). A `Pool` created
 * once at module scope gets reused across requests handled by the same
 * worker isolate and eventually hits this — the request hangs and times out.
 * We use `AsyncLocalStorage` to hand each request its own `Pool`, created on
 * entry via `withDb()` and torn down when the request finishes. `db` itself
 * is a Proxy that resolves to whichever pool is active for the current
 * request, so existing call sites (`db.query...`, `db.transaction...`,
 * including real interactive transactions used by `withRLS` and quota
 * consumption logic) don't need to change — only the request entry points
 * (route handlers, server component pages) need to be wrapped in `withDb()`.
 *
 * @module lib/db
 */

import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import ws from "ws";
import * as schema from "@/db/schema";

// Enable WebSocket for local Node.js environments (npx tsx, seed scripts)
// Cloudflare Workers has native global WebSocket, so we skip polyfilling there.
if (typeof WebSocket === "undefined" && typeof window === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

type Db = NeonDatabase<typeof schema>;

const dbContext = new AsyncLocalStorage<{ db: Db; pool: Pool | null }>();

function createConnection(): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return { db: drizzle(pool, { schema }), pool };
}

/**
 * A pool-less connection over Neon's HTTP endpoint: one `fetch` per query,
 * no WebSocket, no handshake, nothing to tear down.
 *
 * The WebSocket pool above buys interactive transactions, and every request
 * was paying for it whether it used one or not. A pool is a TLS handshake and
 * a socket held open for the life of the request; a dashboard sitting on a
 * poll opened one every couple of seconds, and enough of those at once is
 * what put the worker over its 128 MB memory limit on 2026-08-06 and -07
 * (error 1102). Reads that never open a transaction have no reason to pay it.
 *
 * Typed as the pooled `Db` so the `db` proxy and every call site stay
 * unchanged — the two drivers differ only in `.transaction()`, which the
 * HTTP driver refuses at runtime. That is what `withHttpDb` is documented to
 * exclude, and `withRLS` is the thing to grep for.
 */
function createHttpConnection(): { db: Db; pool: null } {
  const client = neon(process.env.DATABASE_URL!);
  return { db: drizzleHttp(client, { schema }) as unknown as Db, pool: null };
}

/**
 * Wraps a request handler so all `db` access inside it (including nested
 * calls like `requireAuth` → `getAuthContext`, or Better-Auth's adapter)
 * shares one pool scoped to this request only. Every API route handler and
 * server component page that touches the database must call through this.
 */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  // Nested calls (e.g. a helper that also wraps itself) reuse the outer pool.
  if (dbContext.getStore()) {
    return fn();
  }

  const { db: requestDb, pool } = createConnection();
  try {
    return await dbContext.run({ db: requestDb, pool }, fn);
  } finally {
    await pool.end();
  }
}

/**
 * Like `withDb`, but over HTTP — for handlers that only read and write rows
 * and never open a transaction.
 *
 * `db.transaction(...)` inside this (directly, or via `withRLS`) throws:
 * the Neon HTTP driver has no transactions. That is the whole trade. If a
 * handler needs one, it belongs in `withDb`.
 *
 * Better Auth goes through the same `db` proxy, so wrapping a route in this
 * moves session lookup onto HTTP too — it only ever does single-row reads.
 *
 * A handler already inside a `withDb` keeps that pool rather than opening a
 * second connection of a different kind alongside it.
 */
export async function withHttpDb<T>(fn: () => Promise<T>): Promise<T> {
  if (dbContext.getStore()) {
    return fn();
  }

  const { db: requestDb, pool } = createHttpConnection();
  // Nothing to close: there is no socket, only fetches that have already
  // completed by the time the handler returns.
  return dbContext.run({ db: requestDb, pool }, fn);
}

function currentDb(): Db {
  const store = dbContext.getStore();
  if (!store) {
    throw new Error(
      "Database accessed outside of withDb() — wrap the request handler (route.ts export or page.tsx) in withDb()."
    );
  }
  return store.db;
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
