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

import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import ws from "ws";
import * as schema from "@/db/schema";

// Enable WebSocket for local Node.js environments (npx tsx, seed scripts)
if (typeof window === "undefined" && !process.env.OPENNEXT_CLOUDFLARE) {
  neonConfig.webSocketConstructor = ws;
}

const connectionString = process.env.DATABASE_URL!;

const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

/**
 * RLS context — sets Postgres session variables for Row-Level Security.
 */
export async function withRLS<T>(
  ctx: { userId: string; orgId: string; role: string },
  fn: (tx: typeof db) => Promise<T>
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

    return fn(tx as unknown as typeof db);
  });
}
