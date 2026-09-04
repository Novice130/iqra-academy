-- Phase 4: Secure realtime scheduling
-- Adds version column to scheduling_events table for optimistic tracking and event deduplication.

ALTER TABLE "scheduling_events" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
