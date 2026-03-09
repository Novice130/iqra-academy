/**
 * @fileoverview Drizzle ORM Client Singleton
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * In development, Next.js hot-reloads your code frequently. Each reload would
 * create a NEW database connection. After a few reloads, you'd exhaust
 * Neon's connection limit and get errors.
 *
 * THE FIX: Store the Drizzle client on `globalThis` (a special global object
 * that persists across hot reloads). In production, we just create one client.
 *
 * @module lib/db
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/db/schema";

/**
 * Creates the underlying postgres.js connection.
 * postgres.js is a fast, pure-JS driver — no native binaries needed.
 */
const connectionString = process.env.DATABASE_URL!;

/**
 * Type declaration for storing the client on globalThis.
 */
const globalForDrizzle = globalThis as unknown as {
  db: ReturnType<typeof createDrizzleClient> | undefined;
  pgClient: ReturnType<typeof postgres> | undefined;
};

function createDrizzleClient() {
  const client = globalForDrizzle.pgClient ?? postgres(connectionString, {
    ssl: "require",  // Required for Neon — connections fail without this
    max: 10,         // Connection pool size
  });
  if (process.env.NODE_ENV !== "production") {
    globalForDrizzle.pgClient = client;
  }
  return drizzle(client, {
    schema,
    logger: process.env.NODE_ENV === "development",
  });
}

/**
 * The singleton Drizzle client instance.
 *
 * USAGE:
 * ```ts
 * import { db } from "@/lib/db";
 * import { users } from "@/db/schema";
 * import { eq } from "drizzle-orm";
 *
 * const allUsers = await db.select().from(users).where(eq(users.orgId, "org_123"));
 * // OR relational queries:
 * const usersWithProfiles = await db.query.users.findMany({
 *   where: eq(users.orgId, "org_123"),
 *   with: { studentProfiles: true },
 * });
 * ```
 */
export const db = globalForDrizzle.db ?? createDrizzleClient();

if (process.env.NODE_ENV !== "production") {
  globalForDrizzle.db = db;
}

/**
 * RLS context — sets Postgres session variables for Row-Level Security.
 *
 * 📚 HOW RLS WORKS WITH THIS:
 * 1. Your API route calls `withRLS(ctx, async (tx) => { ... })`
 * 2. This function does `SET LOCAL app.current_org_id = 'xxx'` inside a transaction
 * 3. All queries inside the callback automatically get filtered by RLS policies
 * 4. When the transaction ends, the session variables are cleared (SET LOCAL is tx-scoped)
 *
 * USAGE:
 * ```ts
 * import { withRLS } from "@/lib/db";
 *
 * export async function GET(request: NextRequest) {
 *   const ctx = await requireAuth(request);
 *   return withRLS(ctx, async (tx) => {
 *     // This query is automatically filtered by RLS policies!
 *     const myBookings = await tx.select().from(bookings);
 *     return NextResponse.json({ bookings: myBookings });
 *   });
 * }
 * ```
 *
 * WHY `SET LOCAL`?
 * `SET LOCAL` only lasts for the current transaction. If we used `SET`
 * (without LOCAL), the session variables would persist across queries
 * from different users sharing the same connection — a security hole!
 *
 * @param ctx - Auth context with userId, orgId, role
 * @param fn - Callback that receives a transaction-scoped DB client
 * @returns The result of the callback
 */
export async function withRLS<T>(
  ctx: { userId: string; orgId: string; role: string },
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // Set session variables for RLS policies
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${ctx.orgId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.current_role', ${ctx.role}, true)`
    );

    // Run the user's query function within the RLS context
    return fn(tx as unknown as typeof db);
  });
}
