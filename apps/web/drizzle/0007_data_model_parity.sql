-- Phase 2: Data model parity and migration
-- Creates SessionOrigin and BreakoutStatus enums, collaboration tables,
-- constraints, indexes, backfill, and RLS tenant isolation policies.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BreakoutStatus') THEN
    CREATE TYPE "public"."BreakoutStatus" AS ENUM('DRAFT', 'OPEN', 'CLOSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SessionOrigin') THEN
    CREATE TYPE "public"."SessionOrigin" AS ENUM('SCHEDULED', 'INSTANT', 'TRIAL', 'MAKEUP', 'WEBHOOK');
  END IF;
END $$;--> statement-breakpoint

ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'AVAILABILITY_CHANGED';--> statement-breakpoint

-- 1. Collaboration Tables
CREATE TABLE IF NOT EXISTS "breakout_sets" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
  "session_id" text NOT NULL REFERENCES "public"."sessions"("id"),
  "status" "BreakoutStatus" DEFAULT 'DRAFT' NOT NULL,
  "opened_at" timestamp,
  "closed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "breakout_sets_session_idx" ON "breakout_sets" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "breakout_sets_org_idx" ON "breakout_sets" USING btree ("org_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "breakout_rooms" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
  "breakout_set_id" text NOT NULL REFERENCES "public"."breakout_sets"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "video_room_name" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "breakout_rooms_set_idx" ON "breakout_rooms" USING btree ("breakout_set_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "breakout_rooms_org_idx" ON "breakout_rooms" USING btree ("org_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "breakout_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
  "breakout_room_id" text NOT NULL REFERENCES "public"."breakout_rooms"("id") ON DELETE cascade,
  "user_id" text REFERENCES "public"."users"("id"),
  "student_profile_id" text REFERENCES "public"."student_profiles"("id"),
  "participant_identity" text,
  "joined_at" timestamp,
  "returned_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "breakout_assignments_room_idx" ON "breakout_assignments" USING btree ("breakout_room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "breakout_assignments_org_idx" ON "breakout_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "breakout_assignments_user_idx" ON "breakout_assignments" USING btree ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "whiteboards" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
  "session_id" text NOT NULL REFERENCES "public"."sessions"("id"),
  "board_id" text NOT NULL,
  "durable_object_key" text,
  "state_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "whiteboards_session_board_idx" ON "whiteboards" USING btree ("session_id", "board_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whiteboards_org_idx" ON "whiteboards" USING btree ("org_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_reactions" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
  "session_id" text NOT NULL REFERENCES "public"."sessions"("id"),
  "user_id" text NOT NULL REFERENCES "public"."users"("id"),
  "reaction" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "meeting_reactions_session_idx" ON "meeting_reactions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_reactions_org_idx" ON "meeting_reactions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_reactions_user_idx" ON "meeting_reactions" USING btree ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "caption_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
  "user_id" text NOT NULL REFERENCES "public"."users"("id"),
  "language" text DEFAULT 'ar' NOT NULL,
  "font_size" text DEFAULT 'medium' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "caption_preferences_org_user_idx" ON "caption_preferences" USING btree ("org_id", "user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "two_factor" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint

-- 2. Column additions
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "payload" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_org_idx" ON "notifications" USING btree ("org_id");--> statement-breakpoint

ALTER TABLE "session_attendance" ADD COLUMN IF NOT EXISTS "breakout_room_name" text;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD COLUMN IF NOT EXISTS "breakout_context" jsonb;--> statement-breakpoint

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "origin" "SessionOrigin" DEFAULT 'SCHEDULED';--> statement-breakpoint

-- 3. Backfill session origins from existing heuristics
UPDATE sessions SET origin = 'TRIAL' WHERE is_trial = true;--> statement-breakpoint
UPDATE sessions SET origin = 'INSTANT' WHERE title ILIKE 'Instant Meeting%';--> statement-breakpoint
UPDATE sessions SET origin = 'WEBHOOK' WHERE calcom_event_id IS NOT NULL;--> statement-breakpoint
UPDATE sessions SET origin = 'SCHEDULED' WHERE origin IS NULL;--> statement-breakpoint

ALTER TABLE "sessions" ALTER COLUMN "origin" SET NOT NULL;--> statement-breakpoint

-- 4. Constraints and Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_org_user_session_idx" ON "bookings" USING btree ("org_id", "user_id", "session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_calcom_booking_id_unique" ON "bookings" USING btree ("calcom_booking_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sessions_org_status_start_idx" ON "sessions" USING btree ("org_id", "status", "scheduled_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_org_teacher_start_idx" ON "sessions" USING btree ("org_id", "teacher_id", "scheduled_start");--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_end_after_start') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_end_after_start" CHECK ("scheduled_end" > "scheduled_start");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_availability_end_after_start') THEN
    ALTER TABLE "teacher_availability" ADD CONSTRAINT "teacher_availability_end_after_start" CHECK ("end_time" > "start_time");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_time_off_ends_after_starts') THEN
    ALTER TABLE "teacher_time_off" ADD CONSTRAINT "teacher_time_off_ends_after_starts" CHECK ("ends_at" > "starts_at");
  END IF;
END $$;--> statement-breakpoint

-- 5. Row Level Security for Collaboration Tables
ALTER TABLE "breakout_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "breakout_sets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_breakout_sets ON "breakout_sets";--> statement-breakpoint
CREATE POLICY tenant_isolation_breakout_sets ON "breakout_sets"
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');--> statement-breakpoint

ALTER TABLE "breakout_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "breakout_rooms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_breakout_rooms ON "breakout_rooms";--> statement-breakpoint
CREATE POLICY tenant_isolation_breakout_rooms ON "breakout_rooms"
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');--> statement-breakpoint

ALTER TABLE "breakout_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "breakout_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_breakout_assignments ON "breakout_assignments";--> statement-breakpoint
CREATE POLICY tenant_isolation_breakout_assignments ON "breakout_assignments"
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');--> statement-breakpoint

ALTER TABLE "whiteboards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whiteboards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_whiteboards ON "whiteboards";--> statement-breakpoint
CREATE POLICY tenant_isolation_whiteboards ON "whiteboards"
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');--> statement-breakpoint

ALTER TABLE "meeting_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meeting_reactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_meeting_reactions ON "meeting_reactions";--> statement-breakpoint
CREATE POLICY tenant_isolation_meeting_reactions ON "meeting_reactions"
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');--> statement-breakpoint

ALTER TABLE "caption_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "caption_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_caption_preferences ON "caption_preferences";--> statement-breakpoint
CREATE POLICY tenant_isolation_caption_preferences ON "caption_preferences"
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');
