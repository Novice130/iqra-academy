/**
 * @fileoverview Postgres Row-Level Security (RLS) Policies
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * RLS is a Postgres feature that makes the DATABASE ITSELF enforce
 * "who can see what data." Even if your app code has a bug that
 * forgets to filter by orgId, the database won't return unauthorized data.
 *
 * HOW IT WORKS:
 * 1. Your app sets session variables:
 *    SET LOCAL app.current_org_id = 'xxx';
 *    SET LOCAL app.current_user_id = 'yyy';
 *    SET LOCAL app.current_role = 'zzz';
 * 2. Postgres checks these variables against RLS policies on every query.
 * 3. Rows that don't match the policy are invisible (as if they don't exist).
 *
 * CRITICAL POSTGRES RLS ARCHITECTURE RULE:
 * By default, multiple policies on a table are PERMISSIVE and combined with OR!
 * If policy A is "org_id = current_org" and policy B is "role = TEACHER",
 * Postgres evaluates "(org_id = current_org) OR (role = TEACHER)".
 * Any teacher would bypass tenant isolation and see other tenants' data!
 * Therefore, TENANT ISOLATION POLICIES MUST BE MARKED AS RESTRICTIVE:
 * Postgres combines all RESTRICTIVE policies with AND against PERMISSIVE policies:
 * "(RESTRICTIVE policy 1) AND (RESTRICTIVE policy 2) AND (PERMISSIVE 1 OR PERMISSIVE 2)".
 *
 * THIS IS DEFENSE-IN-DEPTH:
 * - Layer 1: API middleware (rbac.ts) checks roles
 * - Layer 2: withRLS() and canonical session guards filter queries
 * - Layer 3: RLS policies on the database (this file)
 *
 * SETUP:
 * Run this SQL against your Neon database:
 *   psql $DATABASE_URL -f src/db/rls-policies.sql
 *
 * @module db/rls-policies
 */

-- ============================================================================
-- ENABLE & FORCE RLS ON SENSITIVE TABLES
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements FORCE ROW LEVEL SECURITY;

ALTER TABLE teacher_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_feedback FORCE ROW LEVEL SECURITY;

ALTER TABLE progress_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_records FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_availability FORCE ROW LEVEL SECURITY;

ALTER TABLE teacher_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_time_off FORCE ROW LEVEL SECURITY;

ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendance FORCE ROW LEVEL SECURITY;

ALTER TABLE call_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_invites FORCE ROW LEVEL SECURITY;

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens FORCE ROW LEVEL SECURITY;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES (Idempotent replay support)
-- ============================================================================

DROP POLICY IF EXISTS tenant_isolation_users ON users;
DROP POLICY IF EXISTS tenant_isolation_profiles ON student_profiles;
DROP POLICY IF EXISTS user_profiles ON student_profiles;
DROP POLICY IF EXISTS tenant_isolation_subscriptions ON subscriptions;
DROP POLICY IF EXISTS user_subscriptions ON subscriptions;
DROP POLICY IF EXISTS tenant_isolation_bookings ON bookings;
DROP POLICY IF EXISTS user_bookings ON bookings;
DROP POLICY IF EXISTS insert_bookings ON bookings;
DROP POLICY IF EXISTS tenant_isolation_sessions ON sessions;
DROP POLICY IF EXISTS update_sessions ON sessions;
DROP POLICY IF EXISTS tenant_isolation_chat ON chat_messages;
DROP POLICY IF EXISTS insert_chat ON chat_messages;
DROP POLICY IF EXISTS update_chat ON chat_messages;
DROP POLICY IF EXISTS tenant_isolation_invoices ON invoices;
DROP POLICY IF EXISTS user_invoices ON invoices;
DROP POLICY IF EXISTS tenant_isolation_entitlements ON entitlements;
DROP POLICY IF EXISTS tenant_isolation_audit ON audit_logs;
DROP POLICY IF EXISTS insert_audit ON audit_logs;
DROP POLICY IF EXISTS tenant_isolation_availability ON teacher_availability;
DROP POLICY IF EXISTS tenant_isolation_time_off ON teacher_time_off;
DROP POLICY IF EXISTS tenant_isolation_attendance ON session_attendance;
DROP POLICY IF EXISTS tenant_isolation_call_invites ON call_invites;
DROP POLICY IF EXISTS user_device_tokens ON device_tokens;
DROP POLICY IF EXISTS user_push_subscriptions ON push_subscriptions;
DROP POLICY IF EXISTS user_feedback ON teacher_feedback;
DROP POLICY IF EXISTS user_progress ON progress_records;

-- ============================================================================
-- RESTRICTIVE TENANT ISOLATION POLICIES (Multi-tenancy via org_id)
-- ============================================================================

-- Users: only visible if in the caller's org (or if SUPER_ADMIN)
CREATE POLICY tenant_isolation_users ON users
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Student profiles: org-scoped
CREATE POLICY tenant_isolation_profiles ON student_profiles
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Subscriptions: org-scoped
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Bookings: org-scoped
CREATE POLICY tenant_isolation_bookings ON bookings
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Sessions: org-scoped
CREATE POLICY tenant_isolation_sessions ON sessions
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Chat messages: org-scoped
CREATE POLICY tenant_isolation_chat ON chat_messages
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Invoices: org-scoped
CREATE POLICY tenant_isolation_invoices ON invoices
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Entitlements: org-scoped
CREATE POLICY tenant_isolation_entitlements ON entitlements
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Teacher availability: org-scoped
CREATE POLICY tenant_isolation_availability ON teacher_availability
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Teacher time-off: org-scoped
CREATE POLICY tenant_isolation_time_off ON teacher_time_off
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Session attendance: org-scoped
CREATE POLICY tenant_isolation_attendance ON session_attendance
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Call invites: org-scoped
CREATE POLICY tenant_isolation_call_invites ON call_invites
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR org_id = current_setting('app.current_org_id', true)
  );

-- Audit logs: org-scoped (null org_id is system-level, visible to SUPER_ADMIN)
CREATE POLICY tenant_isolation_audit ON audit_logs
  AS RESTRICTIVE
  USING (
    current_setting('app.current_role', true) = 'SUPER_ADMIN'
    OR (org_id IS NOT NULL AND org_id = current_setting('app.current_org_id', true))
  );

-- ============================================================================
-- USER-LEVEL PERMISSIVE POLICIES (Within an Org)
-- ============================================================================

-- Bookings: students can see their own bookings; teachers/admins see org bookings
CREATE POLICY user_bookings ON bookings
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('TEACHER', 'ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Student profiles: parents see their children; teachers/admins see org profiles
CREATE POLICY user_profiles ON student_profiles
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('TEACHER', 'ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Subscriptions: students see their own; admins see org subscriptions
CREATE POLICY user_subscriptions ON subscriptions
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Invoices: students see their own; admins see org invoices
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
  );

-- Progress records: visible within app layer joins
CREATE POLICY user_progress ON progress_records
  FOR SELECT
  USING (true);

-- Device tokens: strictly user-scoped
CREATE POLICY user_device_tokens ON device_tokens
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) = 'SUPER_ADMIN'
  );

-- Push subscriptions: strictly user-scoped
CREATE POLICY user_push_subscriptions ON push_subscriptions
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) = 'SUPER_ADMIN'
  );

-- ============================================================================
-- INSERT POLICIES
-- ============================================================================

-- Bookings: users create bookings for themselves within their org
CREATE POLICY insert_bookings ON bookings
  FOR INSERT
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
    AND org_id = current_setting('app.current_org_id', true)
  );

-- Chat messages: users only insert as themselves in their org
CREATE POLICY insert_chat ON chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = current_setting('app.current_user_id', true)
    AND org_id = current_setting('app.current_org_id', true)
  );

-- Audit logs: inserted by system/app layer
CREATE POLICY insert_audit ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- UPDATE POLICIES
-- ============================================================================

-- Chat messages: staff can moderate
CREATE POLICY update_chat ON chat_messages
  FOR UPDATE
  USING (
    current_setting('app.current_role', true) IN ('TEACHER', 'ORG_ADMIN', 'SUPER_ADMIN')
  );

-- Sessions: assigned teacher or staff can update
CREATE POLICY update_sessions ON sessions
  FOR UPDATE
  USING (
    teacher_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_role', true) IN ('ORG_ADMIN', 'SUPER_ADMIN')
  );
