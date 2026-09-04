import { test, expect } from "playwright/test";

/**
 * Unauthenticated requests must be rejected before any tenant data is read.
 * These never touch fixture data and are safe against any database.
 */

test("GET /api/me without a session is rejected", async ({ request }) => {
  const res = await request.get("/api/me");
  expect([401, 403]).toContain(res.status());
});

test("GET /api/admin/users without a session is rejected", async ({ request }) => {
  const res = await request.get("/api/admin/users");
  expect([401, 403]).toContain(res.status());
});

test("GET /api/teachers/students without a session is rejected", async ({ request }) => {
  const res = await request.get("/api/teachers/students");
  expect([401, 403]).toContain(res.status());
});
