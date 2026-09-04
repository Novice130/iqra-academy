import { test, expect } from "playwright/test";

/**
 * Baseline liveness checks. These are the only tests allowed to run without
 * seeded data; everything that needs tenants goes through fixtures/test.ts.
 *
 * NOTE: /api/health currently performs idempotent DDL (CREATE TABLE IF NOT
 * EXISTS two_factor) as a side effect — see src/app/api/health/route.ts and
 * the Phase 0 baseline notes in docs/testing.md. It must not grow beyond
 * IF NOT EXISTS shapes, and making the health check purely read-only is
 * follow-up work.
 */

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("status");
});

// Baseline finding (Phase 0): in the dev environment the health endpoint's
// embedded DDL fails — `ALTER TABLE users ADD COLUMN IF NOT EXISTS
// two_factor_enabled` is rejected by the database configured in .env, so
// `status` comes back "error: Failed query..." while HTTP stays 200. Phase 2
// makes migrations own schema and health a read-only probe; until then this
// stays expected-to-fail so the moment it passes we notice.
test.fail("health endpoint reports a working database", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.json();
  expect(body.status).toBe("ok");
});
