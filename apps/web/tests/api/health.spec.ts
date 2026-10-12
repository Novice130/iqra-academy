import { test, expect } from "playwright/test";

/**
 * Baseline liveness checks. These are the only tests allowed to run without
 * seeded data; everything that needs tenants goes through fixtures/test.ts.
 */

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("status");
});

test("health endpoint reports a working database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});
