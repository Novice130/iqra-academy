import "dotenv/config";
import { defineConfig, devices } from "playwright/test";

/**
 * Playwright harness for the web app.
 *
 * Two projects:
 *   api  — request-level tests (tests/api): authz boundaries, tenant
 *          isolation, lifecycle invariants. No browser.
 *   e2e  — browser journeys (tests/e2e): role flows, meeting controls,
 *          visual snapshots.
 *
 * By default a dev server is started on :3000 automatically; set
 * PLAYWRIGHT_BASE_URL to point at an already-running instance instead.
 *
 * Anything that seeds data goes through tests/fixtures/orgs.ts, which refuses
 * to run against a non-isolated database (scripts/lib/require-isolated-db).
 * See docs/testing.md for the isolated-test-DB setup.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "America/New_York",
    locale: "en-US",
  },
  projects: [
    {
      name: "api",
      testDir: "./tests/api",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Turbopack: webpack `next dev` fails at boot on this repo — the edge
        // instrumentation bundle crashes with "Code generation from strings
        // disallowed" (Baseline finding, see docs/testing.md).
        command: "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
