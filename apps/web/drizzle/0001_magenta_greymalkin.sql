CREATE TYPE "public"."BreakoutStatus" AS ENUM('DRAFT', 'OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."SessionOrigin" AS ENUM('SCHEDULED', 'INSTANT', 'TRIAL', 'MAKEUP', 'WEBHOOK');--> statement-breakpoint
ALTER TYPE "public"."NotificationType" ADD VALUE 'AVAILABILITY_CHANGED';--> statement-breakpoint
CREATE TABLE "breakout_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"breakout_room_id" text NOT NULL,
	"user_id" text,
	"student_profile_id" text,
	"participant_identity" text,
	"joined_at" timestamp,
	"returned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breakout_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"breakout_set_id" text NOT NULL,
	"title" text NOT NULL,
	"video_room_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breakout_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"session_id" text NOT NULL,
	"status" "BreakoutStatus" DEFAULT 'DRAFT' NOT NULL,
	"opened_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caption_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"language" text DEFAULT 'ar' NOT NULL,
	"font_size" text DEFAULT 'medium' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"teacher_id" text,
	"actor_id" text,
	"type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whiteboards" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"session_id" text NOT NULL,
	"board_id" text NOT NULL,
	"durable_object_key" text,
	"state_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "org_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD COLUMN "breakout_room_name" text;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD COLUMN "breakout_context" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "origin" "SessionOrigin" DEFAULT 'SCHEDULED' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "breakout_assignments" ADD CONSTRAINT "breakout_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakout_assignments" ADD CONSTRAINT "breakout_assignments_breakout_room_id_breakout_rooms_id_fk" FOREIGN KEY ("breakout_room_id") REFERENCES "public"."breakout_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakout_assignments" ADD CONSTRAINT "breakout_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakout_assignments" ADD CONSTRAINT "breakout_assignments_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakout_rooms" ADD CONSTRAINT "breakout_rooms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakout_rooms" ADD CONSTRAINT "breakout_rooms_breakout_set_id_breakout_sets_id_fk" FOREIGN KEY ("breakout_set_id") REFERENCES "public"."breakout_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakout_sets" ADD CONSTRAINT "breakout_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakout_sets" ADD CONSTRAINT "breakout_sets_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_preferences" ADD CONSTRAINT "caption_preferences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_preferences" ADD CONSTRAINT "caption_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reactions" ADD CONSTRAINT "meeting_reactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reactions" ADD CONSTRAINT "meeting_reactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reactions" ADD CONSTRAINT "meeting_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_events" ADD CONSTRAINT "scheduling_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_events" ADD CONSTRAINT "scheduling_events_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_events" ADD CONSTRAINT "scheduling_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breakout_assignments_room_idx" ON "breakout_assignments" USING btree ("breakout_room_id");--> statement-breakpoint
CREATE INDEX "breakout_assignments_org_idx" ON "breakout_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "breakout_assignments_user_idx" ON "breakout_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "breakout_rooms_set_idx" ON "breakout_rooms" USING btree ("breakout_set_id");--> statement-breakpoint
CREATE INDEX "breakout_rooms_org_idx" ON "breakout_rooms" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "breakout_sets_session_idx" ON "breakout_sets" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "breakout_sets_org_idx" ON "breakout_sets" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "caption_preferences_org_user_idx" ON "caption_preferences" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "meeting_reactions_session_idx" ON "meeting_reactions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "meeting_reactions_org_idx" ON "meeting_reactions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meeting_reactions_user_idx" ON "meeting_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduling_events_unpublished_idx" ON "scheduling_events" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE INDEX "scheduling_events_org_idx" ON "scheduling_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "scheduling_events_teacher_idx" ON "scheduling_events" USING btree ("org_id","teacher_id","created_at");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE UNIQUE INDEX "whiteboards_session_board_idx" ON "whiteboards" USING btree ("session_id","board_id");--> statement-breakpoint
CREATE INDEX "whiteboards_org_idx" ON "whiteboards" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_org_user_session_idx" ON "bookings" USING btree ("org_id","user_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_calcom_booking_id_unique" ON "bookings" USING btree ("calcom_booking_id");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "notifications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sessions_org_status_start_idx" ON "sessions" USING btree ("org_id","status","scheduled_start");--> statement-breakpoint
CREATE INDEX "sessions_org_teacher_start_idx" ON "sessions" USING btree ("org_id","teacher_id","scheduled_start");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_end_after_start" CHECK ("sessions"."scheduled_end" > "sessions"."scheduled_start");--> statement-breakpoint
ALTER TABLE "teacher_availability" ADD CONSTRAINT "teacher_availability_end_after_start" CHECK ("teacher_availability"."end_time" > "teacher_availability"."start_time");--> statement-breakpoint
ALTER TABLE "teacher_time_off" ADD CONSTRAINT "teacher_time_off_ends_after_starts" CHECK ("teacher_time_off"."ends_at" > "teacher_time_off"."starts_at");