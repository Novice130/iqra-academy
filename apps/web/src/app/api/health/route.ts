import { NextResponse } from "next/server";
import { db, withHttpDb } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
  let dbStatus = "ok";
  let migration = "none";
  try {
    await withHttpDb(async () => {
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled boolean DEFAULT false;`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS two_factor (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          secret text NOT NULL,
          backup_codes text NOT NULL
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS two_factor_user_idx ON two_factor(user_id);`);
      await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload jsonb;`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_org_idx ON notifications USING btree (org_id);`);
      await db.execute(sql`ALTER TABLE session_attendance ADD COLUMN IF NOT EXISTS breakout_room_name text;`);
      await db.execute(sql`ALTER TABLE session_attendance ADD COLUMN IF NOT EXISTS breakout_context jsonb;`);
      migration = "applied";
    });
  } catch (err: any) {
    dbStatus = "error: " + err.message;
  }

  return NextResponse.json({
    status: dbStatus,
    migration,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
}
