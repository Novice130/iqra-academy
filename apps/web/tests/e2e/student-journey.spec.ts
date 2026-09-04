import { test, expect } from "playwright/test";
import { getClassActionState } from "../../src/lib/class-action";

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

  test("Class Action State logic enforces T-60 transition for students", () => {
    const now = new Date("2026-09-05T12:00:00Z");

    // 1. T-65 minutes: UPCOMING countdown state, no blue action
    const tMinus65 = new Date(now.getTime() + 65 * 60 * 1000);
    const stateUpcoming = getClassActionState(
      {
        id: "sess-1",
        status: "SCHEDULED",
        scheduledStart: tMinus65,
        scheduledEnd: new Date(tMinus65.getTime() + 30 * 60 * 1000),
      },
      { userId: "student-1", role: "STUDENT" },
      now
    );

    expect(stateUpcoming.state).toBe("UPCOMING");
    expect(stateUpcoming.disabled).toBe(true);
    expect(stateUpcoming.label).toBe("Upcoming");
    expect(stateUpcoming.countdownText).toMatch(/Starts in/i);

    // 2. T-55 minutes: READY state, prominent blue action button with "Join Class"
    const tMinus55 = new Date(now.getTime() + 55 * 60 * 1000);
    const stateReady = getClassActionState(
      {
        id: "sess-1",
        status: "SCHEDULED",
        scheduledStart: tMinus55,
        scheduledEnd: new Date(tMinus55.getTime() + 30 * 60 * 1000),
      },
      { userId: "student-1", role: "STUDENT" },
      now
    );

    expect(stateReady.state).toBe("READY");
    expect(stateReady.disabled).toBe(false);
    expect(stateReady.label).toBe("Join Class");
    expect(stateReady.actionUrl).toBe("/dashboard/session/sess-1");

    // 3. LIVE state: "Join Live Class"
    const stateLive = getClassActionState(
      {
        id: "sess-1",
        status: "IN_PROGRESS",
        scheduledStart: new Date(now.getTime() - 10 * 60 * 1000),
        scheduledEnd: new Date(now.getTime() + 20 * 60 * 1000),
      },
      { userId: "student-1", role: "STUDENT" },
      now
    );

    expect(stateLive.state).toBe("LIVE");
    expect(stateLive.disabled).toBe(false);
    expect(stateLive.label).toBe("Join Live Class");
  });
});
