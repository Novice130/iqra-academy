-- New in-app notification categories.
--
-- Kept in its own migration on purpose: Postgres will not let a newly added
-- enum value be *used* by other statements in the same transaction, so the
-- ALTERs have to land and commit before 0003 (which references them) runs.
--
-- IF NOT EXISTS so re-running against a partially migrated database is safe.
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'TRIAL_REQUESTED';--> statement-breakpoint
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'TRIAL_CONFIRMED';--> statement-breakpoint
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_ISSUED';--> statement-breakpoint
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'ROLE_GRANTED';
