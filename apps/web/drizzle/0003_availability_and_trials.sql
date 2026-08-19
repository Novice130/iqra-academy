-- Availability that knows its own timezone, time off, trials, and merging.
--
-- BACKGROUND on the timezone column: it has always existed with a default of
-- 'America/New_York', and the write path in api/teachers/availability never
-- set it. So every row on record claims Eastern time while the teacher who
-- entered it was in Asia/Kolkata. The stored hours are not merely unlabelled,
-- they are labelled wrongly. Repair what is knowable, deactivate what is not,
-- then remove the default so a future write that forgets the zone fails
-- instead of lying.

-- 1. Repair from the teacher's own recorded zone.
UPDATE "teacher_availability" ta
SET "timezone" = u."timezone"
FROM "users" u
WHERE u."id" = ta."teacher_id"
  AND u."timezone" IS NOT NULL;--> statement-breakpoint

-- 2. A teacher who never set a zone leaves their hours genuinely unknowable.
--    Deactivate rather than generate bookable slots from a guess — a student
--    booking a guessed hour is worse than a teacher with an empty calendar.
UPDATE "teacher_availability" ta
SET "is_active" = false
FROM "users" u
WHERE u."id" = ta."teacher_id"
  AND u."timezone" IS NULL;--> statement-breakpoint

-- 3. No more silent default. NOT NULL was already true; dropping the default
--    is what turns an omitted zone into an error rather than a wrong answer.
ALTER TABLE "teacher_availability" ALTER COLUMN "timezone" DROP DEFAULT;--> statement-breakpoint

-- 4. Classes are 30 minutes. The old UI hardcoded an hourly grid and derived
--    the end time with a string replace; this column replaces both. Rows stay
--    RANGES (16:00-20:00), sliced into slots at generation time — one row per
--    30-minute cell would be 28 rows per teacher per day and would turn every
--    granularity change into a data migration.
ALTER TABLE "teacher_availability" ADD COLUMN IF NOT EXISTS "slot_minutes" smallint DEFAULT 30 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_availability_active_idx" ON "teacher_availability" USING btree ("org_id","is_active","day_of_week");--> statement-breakpoint

-- 5. Time off: absolute instants, so subtracting it from generated slots is a
--    plain comparison against the same scale as sessions.scheduled_start.
CREATE TABLE IF NOT EXISTS "teacher_time_off" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "teacher_time_off" ADD CONSTRAINT "teacher_time_off_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_time_off" ADD CONSTRAINT "teacher_time_off_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_time_off_teacher_range_idx" ON "teacher_time_off" USING btree ("teacher_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_time_off_org_idx" ON "teacher_time_off" USING btree ("org_id");--> statement-breakpoint

-- 6. A trial is an ordinary session with a flag, so the call stack, ringing,
--    attendance and class-room.ts all keep working untouched.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 7. Merging never deletes. Five tables FK to sessions; a delete either fails
--    on the constraint or orphans history. The merged-away row is CANCELLED
--    and points here instead.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "merged_into_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_merged_into_id_sessions_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_teacher_start_idx" ON "sessions" USING btree ("teacher_id","scheduled_start");
