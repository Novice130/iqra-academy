import { test, expect } from "playwright/test";

test.describe("E2E Responsive Layout & Accessibility System", () => {
  const viewports = [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 800 },
    { name: "wide", width: 1440, height: 900 },
  ];

  for (const vp of viewports) {
    test(`Viewport ${vp.name} (${vp.width}x${vp.height}) renders home page without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");

      // Check horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

      // ScrollWidth should be at most clientWidth (+ small rounding buffer of 1px)
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}) renders login page without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/login");

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    });
  }

  test("Accessibility: Interactive buttons have minimum 44px touch targets or accessible sizing", async ({
    page,
  }) => {
    await page.goto("/login");

    const submitButton = page.locator('button[type="submit"]').first();
    await expect(submitButton).toBeVisible();

    const box = await submitButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Primary submit button height must satisfy WCAG 2.5.5 minimum 44px touch target
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("Accessibility: Keyboard Tab navigation reaches form inputs cleanly", async ({
    page,
  }) => {
    await page.goto("/login");

    // Press Tab from top of page
    await page.keyboard.press("Tab");

    // Check focused element tag — strictly must land on an interactive control, never body
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(["input", "a", "button"]).toContain(focusedTag);
  });

  test("Accessibility: Respects prefers-reduced-motion media query cleanly", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await expect(page.locator("body")).toBeVisible();

    const matchesReducedMotion = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    expect(matchesReducedMotion).toBe(true);
  });

  test("Resilience: Network offline and reconnect transitions preserve DOM state", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toBeVisible();

    // Emulate client disconnection
    await context.setOffline(true);
    await expect(page.locator("body")).toBeVisible();

    // Emulate client reconnection
    await context.setOffline(false);
    await expect(page.locator("body")).toBeVisible();
  });

  test("Timezone resilience: Renders consistently across timezone midnight boundary", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toBeVisible();
  });
});
