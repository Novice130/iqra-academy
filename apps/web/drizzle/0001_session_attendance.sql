CREATE TYPE "public"."AttendanceRole" AS ENUM('TEACHER', 'STUDENT', 'OBSERVER');--> statement-breakpoint
CREATE TABLE "session_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"student_profile_id" text,
	"role" "AttendanceRole" NOT NULL,
	"identity" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"duration_seconds" integer
);
--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_attendance_identity_idx" ON "session_attendance" USING btree ("session_id","identity");--> statement-breakpoint
CREATE INDEX "session_attendance_session_idx" ON "session_attendance" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_attendance_org_joined_idx" ON "session_attendance" USING btree ("org_id","joined_at");--> statement-breakpoint
CREATE INDEX "session_attendance_user_idx" ON "session_attendance" USING btree ("user_id");
