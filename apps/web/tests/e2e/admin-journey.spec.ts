import { test, expect } from "../fixtures/test";
import { createTestSession } from "../fixtures/orgs";

test.describe("E2E Admin Journey: Architecture, Dedicated Routes & Protected Accounts", () => {
  test("Unauthenticated access to admin routes redirects to /login", async ({ page }) => {
    const adminRoutes = [
      "/admin",
      "/admin/live-classes",
      "/admin/scheduled-classes",
      "/admin/teacher-schedules",
      "/admin/assign-student",
      "/admin/users",
      "/admin/invoices",
    ];

    for (const route of adminRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/login/);
    }
  });

  test("Unknown /admin/* path returns dedicated 404 page rather than catch-all dashboard", async ({
    page,
    context,
    orgA,
    baseURL,
  }) => {
    const token = await createTestSession(orgA.admin.id);
    const domain = baseURL ? new URL(baseURL).hostname : "localhost";
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: token,
        domain,
        path: "/",
      },
    ]);

    const response = await page.goto("/admin/nonexistent-route-should-404");
    expect(response?.status()).toBe(404);

    // Page must render not-found UI with link back to /admin
    const backLink = page.locator('a[href="/admin"]');
    await expect(backLink.first()).toBeVisible();
    await expect(page.locator("text=Admin Page Not Found")).toBeVisible();
  });

  test("Admin information architecture: Home page design strictly separates live from scheduled classes", async ({
    page,
    context,
    orgA,
    baseURL,
  }) => {
    const token = await createTestSession(orgA.admin.id);
    const domain = baseURL ? new URL(baseURL).hostname : "localhost";
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: token,
        domain,
        path: "/",
      },
    ]);

    // 1. /admin contains Live Classes overview
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("h2").filter({ hasText: /live classes/i }).first()).toBeVisible();

    // 2. /admin/scheduled-classes is dedicated to scheduled classes
    await page.goto("/admin/scheduled-classes");
    await expect(page).toHaveURL(/\/admin\/scheduled-classes/);
    await expect(page.locator("h1").filter({ hasText: /scheduled classes/i }).first()).toBeVisible();

    // 3. /admin/teacher-schedules is dedicated to teacher weekly schedules
    await page.goto("/admin/teacher-schedules");
    await expect(page).toHaveURL(/\/admin\/teacher-schedules/);
    await expect(page.locator("h1").filter({ hasText: /teacher schedules/i }).first()).toBeVisible();
  });
});
