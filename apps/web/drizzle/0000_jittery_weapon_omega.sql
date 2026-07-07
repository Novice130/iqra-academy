CREATE TYPE "public"."AuditAction" AS ENUM('USER_LOGIN', 'USER_LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'ROLE_CHANGED', 'IMPERSONATION_START', 'IMPERSONATION_END', 'PAYMENT_RECEIVED', 'REFUND_ISSUED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_CANCELLED', 'SESSION_CREATED', 'SESSION_COMPLETED', 'BOOKING_CREATED', 'BOOKING_CANCELLED', 'CHAT_MESSAGE_HIDDEN', 'CHAT_MESSAGE_DELETED', 'COUPON_CREATED', 'EXPORT_GENERATED', 'SETTINGS_CHANGED', 'RECORDING_ACCESS_CHANGED');--> statement-breakpoint
CREATE TYPE "public"."BookingStatus" AS ENUM('CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."CrmSyncType" AS ENUM('CONTACT_CREATED', 'CONTACT_UPDATED', 'DEAL_CREATED', 'DEAL_UPDATED', 'CANCELLATION_SYNCED', 'DELINQUENCY_SYNCED');--> statement-breakpoint
CREATE TYPE "public"."DayOfWeek" AS ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');--> statement-breakpoint
CREATE TYPE "public"."InvoiceStatus" AS ENUM('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE', 'OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."PaymentMethod" AS ENUM('MANUAL_INVOICE', 'AUTO_CHARGE');--> statement-breakpoint
CREATE TYPE "public"."PlanTier" AS ENUM('FREE', 'INDIVIDUAL', 'GROUP', 'SIBLINGS');--> statement-breakpoint
CREATE TYPE "public"."RecordingAccess" AS ENUM('NONE', 'STUDENT_ONLY', 'STUDENT_AND_OBSERVERS', 'ALL');--> statement-breakpoint
CREATE TYPE "public"."SessionStatus" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."SessionType" AS ENUM('INDIVIDUAL', 'GROUP', 'SIBLINGS', 'WEBINAR');--> statement-breakpoint
CREATE TYPE "public"."SubscriptionStatus" AS ENUM('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIALING', 'UNPAID', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."Track" AS ENUM('QAIDAH', 'QURAN_READING', 'HIFZ');--> statement-breakpoint
CREATE TYPE "public"."UserRole" AS ENUM('STUDENT', 'TEACHER', 'ORG_ADMIN', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"actor_id" text,
	"action" "AuditAction" NOT NULL,
	"target" text,
	"metadata" json DEFAULT '{}'::json,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"student_profile_id" text,
	"session_id" text NOT NULL,
	"status" "BookingStatus" DEFAULT 'CONFIRMED' NOT NULL,
	"calcom_booking_id" text,
	"calcom_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"room_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_moderation_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"message_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"session_id" text,
	"is_org_wide" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redeemed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_percent" integer,
	"discount_amount_cents" integer,
	"max_redemptions" integer,
	"current_redemptions" integer DEFAULT 0 NOT NULL,
	"duration" text DEFAULT 'once' NOT NULL,
	"duration_in_months" integer,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"stripe_coupon_id" text,
	"applicable_tiers" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons_applied" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"duration_months" integer,
	"months_used" integer DEFAULT 0 NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_sync_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"sync_type" "CrmSyncType" NOT NULL,
	"external_id" text,
	"payload" json DEFAULT '{}'::json,
	"success" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "default_weekly_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"student_profile_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"track" "Track" NOT NULL,
	"day_of_week" "DayOfWeek" NOT NULL,
	"start_time" time NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"student_profile_id" text,
	"week_start_date" timestamp NOT NULL,
	"total_classes" integer NOT NULL,
	"used_classes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text,
	"stripe_invoice_id" text,
	"status" "InvoiceStatus" DEFAULT 'DRAFT' NOT NULL,
	"amount_due_cents" integer NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"hosted_invoice_url" text,
	"invoice_pdf" text,
	"due_date" timestamp,
	"paid_at" timestamp,
	"period_start" timestamp,
	"period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_content" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"track" "Track" NOT NULL,
	"sort_order" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"objectives" json DEFAULT '[]'::json,
	"estimated_minutes" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observer_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"profile_ids" json DEFAULT '[]'::json,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text,
	"logo_url" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"settings" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"tier" "PlanTier" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_in_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"classes_per_week" integer DEFAULT 4 NOT NULL,
	"max_students" integer DEFAULT 1 NOT NULL,
	"session_type" "SessionType" NOT NULL,
	"stripe_price_id" text,
	"stripe_product_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_records" (
	"id" text PRIMARY KEY NOT NULL,
	"student_profile_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"session_id" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"teacher_approved" boolean DEFAULT false NOT NULL,
	"teacher_approved_at" timestamp,
	"teacher_approved_by" text,
	"teacher_notes" text,
	"score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"platform" text DEFAULT 'WEB' NOT NULL,
	"expo_push_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "session_attendees" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"student_profile_id" text NOT NULL,
	"joined_at" timestamp,
	"left_at" timestamp,
	"duration_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"type" "SessionType" NOT NULL,
	"status" "SessionStatus" DEFAULT 'SCHEDULED' NOT NULL,
	"title" text,
	"track" "Track",
	"scheduled_start" timestamp NOT NULL,
	"scheduled_end" timestamp NOT NULL,
	"actual_start" timestamp,
	"actual_end" timestamp,
	"is_extended" boolean DEFAULT false NOT NULL,
	"extension_min" integer DEFAULT 0 NOT NULL,
	"consumes_quota" boolean DEFAULT true NOT NULL,
	"video_room_name" text,
	"recording_url" text,
	"recording_access" "RecordingAccess" DEFAULT 'NONE' NOT NULL,
	"calcom_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_video_room_name_unique" UNIQUE("video_room_name")
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"date_of_birth" timestamp,
	"track" "Track" DEFAULT 'QAIDAH' NOT NULL,
	"current_level" text DEFAULT 'qaida-basics' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"status" "SubscriptionStatus" DEFAULT 'ACTIVE' NOT NULL,
	"payment_method" "PaymentMethod" DEFAULT 'MANUAL_INVOICE' NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "teacher_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"day_of_week" "DayOfWeek" NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"calcom_schedule_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"student_profile_id" text NOT NULL,
	"audio_url" text NOT NULL,
	"transcription" text,
	"duration" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'seed_org_iqra_academy' NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"phone" text,
	"role" "UserRole" DEFAULT 'STUDENT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_moderation_actions" ADD CONSTRAINT "chat_moderation_actions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_moderation_actions" ADD CONSTRAINT "chat_moderation_actions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_moderation_actions" ADD CONSTRAINT "chat_moderation_actions_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons_applied" ADD CONSTRAINT "coupons_applied_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons_applied" ADD CONSTRAINT "coupons_applied_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sync_events" ADD CONSTRAINT "crm_sync_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sync_events" ADD CONSTRAINT "crm_sync_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_weekly_slots" ADD CONSTRAINT "default_weekly_slots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_weekly_slots" ADD CONSTRAINT "default_weekly_slots_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_weekly_slots" ADD CONSTRAINT "default_weekly_slots_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_content" ADD CONSTRAINT "lesson_content_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observer_emails" ADD CONSTRAINT "observer_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_records" ADD CONSTRAINT "progress_records_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_records" ADD CONSTRAINT "progress_records_lesson_id_lesson_content_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_records" ADD CONSTRAINT "progress_records_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_records" ADD CONSTRAINT "progress_records_teacher_approved_by_users_id_fk" FOREIGN KEY ("teacher_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendees" ADD CONSTRAINT "session_attendees_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendees" ADD CONSTRAINT "session_attendees_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_availability" ADD CONSTRAINT "teacher_availability_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_availability" ADD CONSTRAINT "teacher_availability_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_feedback" ADD CONSTRAINT "teacher_feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_feedback" ADD CONSTRAINT "teacher_feedback_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_feedback" ADD CONSTRAINT "teacher_feedback_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_token_idx" ON "auth_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "bookings_org_idx" ON "bookings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bookings_user_idx" ON "bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookings_session_idx" ON "bookings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "bookings_profile_idx" ON "bookings" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "chat_messages_room_idx" ON "chat_messages" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "chat_messages_org_idx" ON "chat_messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chat_moderation_message_idx" ON "chat_moderation_actions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "chat_moderation_org_idx" ON "chat_moderation_actions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chat_rooms_org_idx" ON "chat_rooms" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chat_rooms_session_idx" ON "chat_rooms" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_unique_idx" ON "coupon_redemptions" USING btree ("coupon_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_org_code_idx" ON "coupons" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "coupons_org_idx" ON "coupons" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_applied_sub_coupon_idx" ON "coupons_applied" USING btree ("subscription_id","coupon_id");--> statement-breakpoint
CREATE INDEX "crm_sync_events_org_idx" ON "crm_sync_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crm_sync_events_user_idx" ON "crm_sync_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_sync_events_type_idx" ON "crm_sync_events" USING btree ("sync_type");--> statement-breakpoint
CREATE UNIQUE INDEX "default_weekly_slots_profile_track_idx" ON "default_weekly_slots" USING btree ("student_profile_id","track");--> statement-breakpoint
CREATE INDEX "default_weekly_slots_org_idx" ON "default_weekly_slots" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "default_weekly_slots_teacher_idx" ON "default_weekly_slots" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_sub_week_profile_idx" ON "entitlements" USING btree ("subscription_id","week_start_date","student_profile_id");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_stripe_idx" ON "invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lesson_content_org_idx" ON "lesson_content" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_content_org_track_order_idx" ON "lesson_content" USING btree ("org_id","track","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "observer_emails_user_email_idx" ON "observer_emails" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "plans_org_idx" ON "plans" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_records_profile_lesson_idx" ON "progress_records" USING btree ("student_profile_id","lesson_id");--> statement-breakpoint
CREATE INDEX "progress_records_profile_idx" ON "progress_records" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_attendees_unique_idx" ON "session_attendees" USING btree ("session_id","student_profile_id");--> statement-breakpoint
CREATE INDEX "sessions_org_idx" ON "sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sessions_teacher_idx" ON "sessions" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "sessions_start_idx" ON "sessions" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "student_profiles_user_idx" ON "student_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_profiles_org_idx" ON "student_profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_idx" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "teacher_availability_org_idx" ON "teacher_availability" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "teacher_availability_teacher_idx" ON "teacher_availability" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "teacher_feedback_session_idx" ON "teacher_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "teacher_feedback_student_idx" ON "teacher_feedback" USING btree ("student_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_org_idx" ON "users" USING btree ("email","org_id");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");