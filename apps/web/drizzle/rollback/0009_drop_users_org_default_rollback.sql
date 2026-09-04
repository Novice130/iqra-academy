-- Rollback for 0009_drop_users_org_default.sql
-- Restores the seed-org default. Only use to un-break a writer that relied
-- on the default instead of passing orgId explicitly (fix the writer too).
ALTER TABLE "users" ALTER COLUMN "org_id" SET DEFAULT 'seed_org_iqra_academy';--> statement-breakpoint
