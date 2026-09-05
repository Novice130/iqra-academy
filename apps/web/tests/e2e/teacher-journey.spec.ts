import { test, expect } from "../fixtures/test";
import { createTestSession } from "../fixtures/orgs";

test.describe("E2E Teacher Journey: Dashboard, Availability & Schedule Lifecycle", () => {
  test("Unauthenticated access to teacher routes redirects to /login", async ({ page }) => {
    const teacherRoutes = [
      "/dashboard/teacher",
      "/dashboard/teacher/availability",
      "/dashboard/teacher/students",
      "/dashboard/teacher/messages",
    ];

    for (const route of teacherRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/login/);
    }
  });

  test("Authenticated teacher journey: Dashboard, availability editor and student directory", async ({
    page,
    context,
    orgA,
    baseURL,
  }) => {
    const token = await createTestSession(orgA.teacher.id);
    const domain = baseURL ? new URL(baseURL).hostname : "localhost";
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: token,
        domain,
        path: "/",
      },
    ]);

    // 1. Teacher Dashboard
    await page.goto("/dashboard/teacher");
    await expect(page).toHaveURL(/\/dashboard\/teacher/);
    await expect(page.locator("body")).toBeVisible();

    // 2. Teacher Availability page
    await page.goto("/dashboard/teacher/availability");
    await expect(page).toHaveURL(/\/dashboard\/teacher\/availability/);
    await expect(page.locator("body")).toBeVisible();
    // Availability page should render timezone selector and action buttons
    await expect(page.locator("button, select").filter({ hasText: /save|timezone|apply|confirm/i }).first()).toBeVisible();

    // 3. Teacher Students page
    await page.goto("/dashboard/teacher/students");
    await expect(page).toHaveURL(/\/dashboard\/teacher\/students/);
    await expect(page.locator("body")).toBeVisible();
    // Search input or filter controls should be visible
    await expect(page.locator('input[placeholder*="search" i], select').first()).toBeVisible();
  });
});
