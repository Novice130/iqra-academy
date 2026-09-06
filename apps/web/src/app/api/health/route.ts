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
      await db.execute(sql`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SessionOrigin') THEN
            CREATE TYPE "SessionOrigin" AS ENUM ('SCHEDULED', 'INSTANT', 'TRIAL', 'MAKEUP', 'WEBHOOK');
          END IF;
        END $$;
      `);
      await db.execute(sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS origin "SessionOrigin" NOT NULL DEFAULT 'SCHEDULED';`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS scheduling_events (
          id text PRIMARY KEY,
          org_id text NOT NULL REFERENCES organizations(id),
          teacher_id text REFERENCES users(id),
          actor_id text REFERENCES users(id),
          type text NOT NULL,
          aggregate_type text NOT NULL,
          aggregate_id text,
          created_at timestamp DEFAULT now() NOT NULL,
          published_at timestamp,
          attempts smallint DEFAULT 0 NOT NULL,
          version integer DEFAULT 1 NOT NULL
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS scheduling_events_unpublished_idx ON scheduling_events(published_at, created_at);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS scheduling_events_org_idx ON scheduling_events(org_id, created_at);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS scheduling_events_teacher_idx ON scheduling_events(org_id, teacher_id, created_at);`);
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
