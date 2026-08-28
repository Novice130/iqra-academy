CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sessions a
    JOIN sessions b
      ON a.teacher_id = b.teacher_id
     AND a.id < b.id
     AND a.status IN ('SCHEDULED', 'IN_PROGRESS')
     AND b.status IN ('SCHEDULED', 'IN_PROGRESS')
     AND tsrange(a.scheduled_start, a.scheduled_end, '[)') && tsrange(b.scheduled_start, b.scheduled_end, '[)')
  ) THEN
    RAISE EXCEPTION 'Active teacher sessions overlap; resolve them before applying scheduling exclusion constraint';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_valid_range CHECK (scheduled_end > scheduled_start);--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_teacher_no_overlap EXCLUDE USING gist (
  teacher_id WITH =,
  tsrange(scheduled_start, scheduled_end, '[)') WITH &&
) WHERE (status IN ('SCHEDULED', 'IN_PROGRESS'));--> statement-breakpoint
CREATE TABLE scheduling_events (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  teacher_id text REFERENCES users(id),
  actor_id text REFERENCES users(id),
  type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  published_at timestamp,
  attempts smallint NOT NULL DEFAULT 0
);--> statement-breakpoint
CREATE INDEX scheduling_events_unpublished_idx ON scheduling_events (published_at, created_at);--> statement-breakpoint
CREATE INDEX scheduling_events_org_idx ON scheduling_events (org_id, created_at);--> statement-breakpoint
CREATE INDEX scheduling_events_teacher_idx ON scheduling_events (org_id, teacher_id, created_at);--> statement-breakpoint
ALTER TABLE teacher_availability ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE teacher_availability FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_teacher_availability ON teacher_availability;--> statement-breakpoint
CREATE POLICY tenant_isolation_teacher_availability ON teacher_availability
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');--> statement-breakpoint
ALTER TABLE teacher_time_off ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE teacher_time_off FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_teacher_time_off ON teacher_time_off;--> statement-breakpoint
CREATE POLICY tenant_isolation_teacher_time_off ON teacher_time_off
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');--> statement-breakpoint
ALTER TABLE scheduling_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE scheduling_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation_scheduling_events ON scheduling_events
  USING (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN')
  WITH CHECK (org_id = current_setting('app.current_org_id', true) OR current_setting('app.current_role', true) = 'SUPER_ADMIN');
