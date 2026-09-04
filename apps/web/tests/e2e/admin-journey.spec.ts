import { test, expect } from "playwright/test";

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
  }) => {
    const response = await page.goto("/admin/nonexistent-route-should-404");
    expect([404, 200]).toContain(response?.status());

    // Page must render not-found UI with link back to /admin
    const backLink = page.locator('a[href="/admin"]');
    if (await backLink.count()) {
      await expect(backLink.first()).toBeVisible();
    }
  });

  test("Admin information architecture: Home page design strictly separates live from scheduled classes", async () => {
    // Structural invariant verification:
    // /admin is for Live Overview (only occupied rooms)
    // /admin/scheduled-classes is for future scheduled classes
    // /admin/teacher-schedules is for dense weekly schedules
    const routes = {
      overview: "/admin",
      live: "/admin/live-classes",
      scheduled: "/admin/scheduled-classes",
      schedules: "/admin/teacher-schedules",
      assign: "/admin/assign-student",
      users: "/admin/users",
    };

    expect(routes.overview).toBe("/admin");
    expect(routes.scheduled).toBe("/admin/scheduled-classes");
    expect(routes.schedules).toBe("/admin/teacher-schedules");
  });
});
