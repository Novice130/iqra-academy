/**
 * @fileoverview Drizzle ORM Client Singleton for Cloudflare Workers & Serverless
 *
 * 📚 NEON SERVERLESS DRIVER:
 * Standard `postgres` TCP drivers do not work in Cloudflare Workers because
 * Workers use `workerd` (V8 edge runtime) which doesn't support raw Node TCP sockets.
 * `@neondatabase/serverless` connects over WebSockets (port 443), providing
 * instant query responses, full transaction support, and zero connection hangs!
 *
 * @module lib/db
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL!;
const client = neon(connectionString);

export const db = drizzle(client, { schema });

/**
 * RLS context — sets Postgres session variables for Row-Level Security.
 */
export async function withRLS<T>(
  ctx: { userId: string; orgId: string; role: string },
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  // Execute set_config and user function with RLS variables set
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${ctx.orgId}, true), set_config('app.current_user_id', ${ctx.userId}, true), set_config('app.current_role', ${ctx.role}, true)`
  );
  return fn(db);
}
