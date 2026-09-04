-- Rollback script for 0007_data_model_parity.sql
-- Restores database schema to 0006_scheduling_realtime state.

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS tenant_isolation_caption_preferences ON "caption_preferences";--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_meeting_reactions ON "meeting_reactions";--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_whiteboards ON "whiteboards";--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_breakout_assignments ON "breakout_assignments";--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_breakout_rooms ON "breakout_rooms";--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_breakout_sets ON "breakout_sets";--> statement-breakpoint

-- 2. Drop Collaboration Tables
DROP TABLE IF EXISTS "caption_preferences";--> statement-breakpoint
DROP TABLE IF EXISTS "meeting_reactions";--> statement-breakpoint
DROP TABLE IF EXISTS "whiteboards";--> statement-breakpoint
DROP TABLE IF EXISTS "breakout_assignments";--> statement-breakpoint
DROP TABLE IF EXISTS "breakout_rooms";--> statement-breakpoint
DROP TABLE IF EXISTS "breakout_sets";--> statement-breakpoint
DROP TABLE IF EXISTS "two_factor";--> statement-breakpoint

-- 3. Drop Constraints and Indexes
ALTER TABLE "teacher_time_off" DROP CONSTRAINT IF EXISTS "teacher_time_off_ends_after_starts";--> statement-breakpoint
ALTER TABLE "teacher_availability" DROP CONSTRAINT IF EXISTS "teacher_availability_end_after_start";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_end_after_start";--> statement-breakpoint

DROP INDEX IF EXISTS "sessions_org_teacher_start_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sessions_org_status_start_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_calcom_booking_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_org_user_session_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notifications_org_idx";--> statement-breakpoint

-- 4. Drop Added Columns
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "origin";--> statement-breakpoint
ALTER TABLE "session_attendance" DROP COLUMN IF EXISTS "breakout_context";--> statement-breakpoint
ALTER TABLE "session_attendance" DROP COLUMN IF EXISTS "breakout_room_name";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "payload";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "two_factor_enabled";--> statement-breakpoint

-- 5. Drop Created Types
DROP TYPE IF EXISTS "public"."SessionOrigin";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."BreakoutStatus";
