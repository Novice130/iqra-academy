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
  const client = globalForDrizzle.pgClient ?? postgres(connectionString);
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
