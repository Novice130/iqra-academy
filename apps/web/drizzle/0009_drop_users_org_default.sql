-- AI2 Phase 1/2 fixes: no silent home org.
-- A missing orgId must fail, not file the row under the seed tenant.
ALTER TABLE "users" ALTER COLUMN "org_id" DROP DEFAULT;--> statement-breakpoint
