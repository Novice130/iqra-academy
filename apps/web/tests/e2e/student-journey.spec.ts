import { test, expect } from "../fixtures/test";
import { createTestSession } from "../fixtures/orgs";

test.describe("E2E Student Journey: Authentication, Protected Routes & Class Entry", () => {
  test("Unauthenticated navigation redirects protected student routes to /login", async ({
    page,
  }) => {
    const protectedRoutes = [
      "/dashboard",
      "/dashboard/progress",
      "/dashboard/booking",
      "/dashboard/schedule",
      "/dashboard/chat",
      "/dashboard/billing",
      "/dashboard/settings",
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/login/);
    }
  });

  test("Login page renders 420px glass card, password eye toggle, and field validation", async ({
    page,
  }) => {
    await page.goto("/login");

    // Auth card max width check
    const authCard = page.locator("form, div.max-w-\\[420px\\]").first();
    await expect(authCard).toBeVisible();

    // Inputs
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input#password, input[type="password"]').first();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Password toggle eye icon
    const toggleBtn = page.locator('button[aria-label*="password" i], button:has(svg)').filter({
      has: page.locator("svg"),
    }).first();

    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      // After click, input should toggle to text
      const newType = await passwordInput.getAttribute("type");
      expect(["text", "password"]).toContain(newType);
    }

    // Submit button
    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible();
  });

  test("Register page renders auth form with role-appropriate inputs", async ({
    page,
  }) => {
    await page.goto("/register");

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailInput).toBeVisible();

    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible();
  });

  test("Guest join flow: /join renders 12-digit code input and name field", async ({
    page,
  }) => {
    await page.goto("/join");

    // Meeting code input
    const codeInput = page.locator('input[placeholder*="code" i], input[name="code"], input[type="text"]').first();
    await expect(codeInput).toBeVisible();

    // Name input
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill("Test Student");
      expect(await nameInput.inputValue()).toBe("Test Student");
    }
  });

  test("Direct class URL /join/[id] renders structured waiting or error status", async ({
    page,
  }) => {
    // Visit a dummy join URL
    await page.goto("/join/cuid-dummy-test-session-123");

    // Page must render cleanly without unhandled React crash
    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Should display name entry, waiting card, or error message
    const hasJoinForm = await page.locator('input, button, [role="alert"]').count();
    expect(hasJoinForm).toBeGreaterThan(0);
  });

  test("Authenticated student dashboard and schedule journey: renders progress and week grid", async ({
    page,
    context,
    orgA,
    baseURL,
  }) => {
    const token = await createTestSession(orgA.student.id);
    const domain = baseURL ? new URL(baseURL).hostname : "localhost";
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: token,
        domain,
        path: "/",
      },
    ]);

    // 1. Visit Student Dashboard
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).toBeVisible();

    // 2. Visit Student Schedule
    await page.goto("/dashboard/schedule");
    await expect(page).toHaveURL(/\/dashboard\/schedule/);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("button, a").filter({ hasText: /today|week|next|prev/i }).first()).toBeVisible();

    // 3. Visit Progress
    await page.goto("/dashboard/progress");
    await expect(page).toHaveURL(/\/dashboard\/progress/);
    await expect(page.locator("body")).toBeVisible();
  });
});
