-- Phase 4 Rollback: Secure realtime scheduling
-- Drops version column from scheduling_events table.

ALTER TABLE "scheduling_events" DROP COLUMN IF EXISTS "version";
