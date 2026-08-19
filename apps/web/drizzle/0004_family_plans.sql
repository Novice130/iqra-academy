-- Family pricing: $70 for one student, $120 for two, $150 for three.
--
-- WHY REMAP RATHER THAN ADD TIERS: `PlanTier` is a Postgres enum, and
-- retiring a value from one is disproportionate work (rewrite every dependent
-- column, drop and recreate the type) for a rename. The three paid tiers
-- already mean "1 student", "a few students" and "a family", so the meanings
-- move and the labels stay:
--
--   INDIVIDUAL  1 student   $70
--   GROUP       2 students  $120   (was "group of 3 strangers, $50")
--   SIBLINGS    3 students  $150   (was "up to 3 children, $100")
--
-- GROUP no longer means unrelated students sharing a class. Both GROUP and
-- SIBLINGS are now family plans, which matters to src/lib/quota.ts: its
-- per-child weekly ledger used to branch on SIBLINGS alone and now covers
-- both. See isPerChildPlan() there.
--
-- Keyed on tier, not on the seed's plan ids, so this also repairs a database
-- whose rows were created by hand.

-- 1. One student, private.
UPDATE "plans" SET
  "price_in_cents" = 7000,
  "max_students" = 1,
  "classes_per_week" = 4,
  "name" = 'One Student',
  "description" = 'Private 1-on-1 Quran classes. 4 classes a week, 30 minutes each.',
  "session_type" = 'INDIVIDUAL'
WHERE "tier" = 'INDIVIDUAL';--> statement-breakpoint

-- 2. Two students from the same family, sharing the account.
UPDATE "plans" SET
  "price_in_cents" = 12000,
  "max_students" = 2,
  "classes_per_week" = 4,
  "name" = 'Two Students',
  "description" = 'Two students from the same family. 4 classes a week each, 30 minutes.',
  "session_type" = 'SIBLINGS'
WHERE "tier" = 'GROUP';--> statement-breakpoint

-- 3. Three students from the same family.
UPDATE "plans" SET
  "price_in_cents" = 15000,
  "max_students" = 3,
  "classes_per_week" = 4,
  "name" = 'Three Students',
  "description" = 'Three students from the same family. 4 classes a week each, 30 minutes.',
  "session_type" = 'SIBLINGS'
WHERE "tier" = 'SIBLINGS';--> statement-breakpoint

-- 4. An invoice we raised by hand needs to say who raised it and why, or a
--    disputed amount has no answer six months later. Nullable because every
--    existing row predates the field, and because a Stripe-created invoice
--    legitimately has no human author.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "issued_by_id" text REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint

-- 5. Find a family's invoices in date order without a sort — the admin list is
--    the only screen that reads this table and it always reads it this way.
CREATE INDEX IF NOT EXISTS "invoices_org_created_idx" ON "invoices" ("org_id", "created_at" DESC);
