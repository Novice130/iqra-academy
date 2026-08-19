-- Audit actions for the two things admins can now do by hand: raise an
-- invoice, and combine two consecutive classes into one.
--
-- Own migration for the same reason 0002 is: Postgres refuses to *use* an
-- enum value added in the still-open transaction that added it. These have to
-- land and commit before any statement (or any deploy) references them.
--
-- Without them both handlers had the choice of logging SETTINGS_CHANGED —
-- which makes "who cancelled this family's class?" unanswerable — or not
-- logging at all. Money and a family's schedule both need an author.
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'INVOICE_ISSUED';--> statement-breakpoint
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'INVOICE_PAID';--> statement-breakpoint
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'INVOICE_VOIDED';--> statement-breakpoint
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'SESSION_MERGED';--> statement-breakpoint
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'SESSION_UNMERGED';
--> statement-breakpoint

-- And the notification a family gets when their class time changes because
-- two classes were combined. MEETING_STARTED was the only vaguely close
-- value, and a push saying "your class has moved" under a type meaning "your
-- class is starting now" would be read by every later report as an attendance
-- signal.
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'CLASS_MOVED';
