/**
 * @fileoverview Postgres Row-Level Security (RLS) Policies
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * RLS is a Postgres feature that makes the DATABASE ITSELF enforce
 * "who can see what data." Even if your app code has a bug that
 * forgets to filter by orgId, the database won't return unauthorized data.
 *
 * HOW IT WORKS:
 * 1. Your app sets session variables: SET LOCAL app.current_org_id = 'xxx'
 * 2. Postgres checks these variables against RLS policies on every query
 * 3. Rows that don't match the policy are invisible (as if they don't exist)
 *
 * THIS IS DEFENSE-IN-DEPTH:
 * - Layer 1: API middleware (rbac.ts) checks roles
 * - Layer 2: orgScope() filters queries by orgId
 * - Layer 3: RLS policies on the database (this file)
 *
 * SETUP:
 * Run this SQL against your Neon database:
 *   psql $DATABASE_URL -f src/db/rls-policies.sql
 *
 * Or via Neon console: paste the SQL and execute.
 *
 * @module db/rls-policies
 */

-- ============================================================================
-- ENABLE RLS ON SENSITIVE TABLES
-- ============================================================================

-- Enable RLS (doesn't affect superuser/owner connections by default)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FORCE RLS FOR THE APP USER
-- ============================================================================

-- IMPORTANT: Create a dedicated app user (not the superuser)
-- that your Next.js app connects with. RLS is NOT enforced for
-- table owners/superusers unless we set FORCE.
--
-- Example:
--   CREATE ROLE app_user LOGIN PASSWORD 'strong_password';
--   GRANT USAGE ON SCHEMA public TO app_user;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE student_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE teacher_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE progress_records FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- TENANT ISOLATION POLICIES (multi-tenancy via org_id)
-- ============================================================================

-- Users: can only see users in their own org
CREATE POLICY tenant_isolation_users ON users
  USING (org_id = current_setting('app.current_org_id', true));

-- Student profiles: org-scoped
CREATE POLICY tenant_isolation_profiles ON student_profiles
  USING (org_id = current_setting('app.current_org_id', true));

-- Subscriptions: org-scoped
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
  USING (org_id = current_setting('app.current_org_id', true));

-- Bookings: org-scoped
CREATE POLICY tenant_isolation_bookings ON bookings
  USING (org_id = current_setting('app.current_org_id', true));

-- Sessions: org-scoped
CREATE POLICY tenant_isolation_sessions ON sessions
  USING (org_id = current_setting('app.current_org_id', true));

-- Chat messages: org-scoped
CREATE POLICY tenant_isolation_chat ON chat_messages
  USING (org_id = current_setting('app.current_org_id', true));

-- Invoices: org-scoped
CREATE POLICY tenant_isolation_invoices ON invoices
  USING (org_id = current_setting('app.current_org_id', true));

-- Audit logs: org-scoped (null org_id = super admin, always visible)
CREATE POLICY tenant_isolation_audit ON audit_logs
  USING (
    org_id IS NULL
    OR org_id = current_setting('app.current_org_id', true)
  );

-- ============================================================================
-- USER-LEVEL POLICIES (row-level access within an org)
-- ============================================================================

-- Students can only see their own bookings
CREATE POLICY user_bookings ON bookings
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('TEACHER', 'ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Students can only see their own student profiles
CREATE POLICY user_profiles ON student_profiles
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('TEACHER', 'ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Students can only see their own subscriptions
CREATE POLICY user_subscriptions ON subscriptions
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Students can only see their own invoices
CREATE POLICY user_invoices ON invoices
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Teacher feedback: visible to session teacher + student profile owner + admins
CREATE POLICY user_feedback ON teacher_feedback
  FOR SELECT
  USING (
    teacher_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('ORG_ADMIN', 'SUPER_ADMIN')
    -- Students see feedback for their profiles (checked at app layer via join)
  );

-- Progress records: visible to the student profile owner + teachers + admins
CREATE POLICY user_progress ON progress_records
  FOR SELECT
  USING (true);  -- Fine-grained access enforced at app layer

-- ============================================================================
-- INSERT POLICIES (who can create data)
-- ============================================================================

-- Bookings: students can create their own bookings
CREATE POLICY insert_bookings ON bookings
  FOR INSERT
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
    AND org_id = current_setting('app.current_org_id', true)
  );

-- Chat messages: users can only send messages as themselves
CREATE POLICY insert_chat ON chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = current_setting('app.current_user_id', true)
    AND org_id = current_setting('app.current_org_id', true)
  );

-- Audit logs: any authenticated user can create (via app)
CREATE POLICY insert_audit ON audit_logs
  FOR INSERT
  WITH CHECK (true);  -- App layer handles who writes audit logs

-- ============================================================================
-- UPDATE POLICIES
-- ============================================================================

-- Chat messages: only teachers/admins can hide/delete
CREATE POLICY update_chat ON chat_messages
  FOR UPDATE
  USING (
    current_setting('app.current_role', true) IN ('TEACHER', 'ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Sessions: only the assigned teacher or admins can update
CREATE POLICY update_sessions ON sessions
  FOR UPDATE
  USING (
    teacher_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('ORG_ADMIN', 'SUPER_ADMIN')
  );
