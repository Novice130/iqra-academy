/**
 * Shared Playwright test object with tenant fixtures.
 *
 *   import { test, expect } from "../fixtures/test";
 *
 *   test("org A cannot read org B", async ({ orgA, orgB }) => { ... });
 *
 * `orgA`/`orgB` are worker-scoped: seeded once per worker, shared by every
 * test in it. Seeding goes through requireIsolatedDb, so simply importing
 * this file can never touch the shared database.
 */

import { test as base } from "playwright/test";
import { seedTwoOrgs, closeTestDb, type TestOrg } from "./orgs";

export { expect } from "playwright/test";

// The first generic must be `{}` (as in Playwright's worker-fixture docs):
// `Record<string, never>` makes the fixture-value inference collapse to
// `never` and worker fixtures stop type-checking.
export const test = base.extend<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {},
  { orgA: TestOrg; orgB: TestOrg }
>({
  orgA: [
    async ({}, use) => {
      const { orgA } = await seedTwoOrgs();
      await use(orgA);
    },
    { scope: "worker" },
  ],
  orgB: [
    async ({}, use) => {
      const { orgB } = await seedTwoOrgs();
      await use(orgB);
      await closeTestDb();
    },
    { scope: "worker" },
  ],
});
