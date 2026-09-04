import { test, expect } from "playwright/test";

/**
 * Browser smoke: the app boots, the marketing page renders, and the auth
 * card is reachable. No seeded data required.
 */

test("home page loads", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/./);
});

test("login page renders the auth form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
});

test("unauthenticated visit to /dashboard redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
});
