/**
 * Two-organization test fixtures.
 *
 * Every tenant-isolation test needs at least two orgs so "org A cannot see
 * org B" is something the test can actually assert, not just imagine. This
 * seeds:
 *
 *   Org A (slug: pw-org-a) — admin, teacher, student
 *   Org B (slug: pw-org-b) — admin, teacher, student
 *
 * Seeding is get-or-create keyed on slug/email, so reruns are stable and
 * idempotent. Rows are deliberately left in place — these fixtures only ever
 * run against an isolated test database (enforced by requireIsolatedDb), and
 * stable ids make debugging failed runs far easier than random per-run
 * tenants. Reset by wiping the test DB branch, not by adding deletes here.
 *
 * The fixture uses its own Drizzle client rather than src/lib/db: Playwright
 * loads test files with its own transpiler, outside the app alias setup, and
 * the AsyncLocalStorage request-pool machinery in lib/db buys nothing here.
 */

import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { eq, and } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { organizations, users } from "../../src/db/schema";
import { requireIsolatedDb } from "../../scripts/lib/require-isolated-db";

if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: "STUDENT" | "TEACHER" | "ORG_ADMIN" | "SUPER_ADMIN";
  orgId: string;
}

export interface TestOrg {
  orgId: string;
  slug: string;
  admin: TestUser;
  teacher: TestUser;
  student: TestUser;
}

type Db = NeonDatabase<typeof schema>;

const ORG_SEEDS = [
  { slug: "pw-org-a", name: "Playwright Org A" },
  { slug: "pw-org-b", name: "Playwright Org B" },
] as const;

const ROLE_SEEDS = [
  { role: "ORG_ADMIN", label: "admin" },
  { role: "TEACHER", label: "teacher" },
  { role: "STUDENT", label: "student" },
] as const;

let sharedDb: { db: Db; pool: Pool } | null = null;

function testDb(): { db: Db; pool: Pool } {
  if (!sharedDb) {
    requireIsolatedDb("playwright-fixtures");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    sharedDb = { db: drizzle(pool, { schema }), pool };
  }
  return sharedDb;
}

export async function closeTestDb(): Promise<void> {
  if (sharedDb) {
    await sharedDb.pool.end();
    sharedDb = null;
  }
}

async function seedOrg(db: Db, seed: (typeof ORG_SEEDS)[number], suffix: "a" | "b"): Promise<TestOrg> {
  const existing = await db.query.organizations.findFirst({ where: eq(organizations.slug, seed.slug) });
  const org =
    existing ??
    (
      await db
        .insert(organizations)
        .values({ name: seed.name, slug: seed.slug, timezone: "America/New_York" })
        .returning()
    )[0];

  const seeded = {} as Record<(typeof ROLE_SEEDS)[number]["label"], TestUser>;
  for (const { role, label } of ROLE_SEEDS) {
    const email = `pw-${label}-${suffix}@test.invalid`;
    const existingUser = await db.query.users.findFirst({
      where: and(eq(users.email, email), eq(users.orgId, org.id)),
    });
    const user =
      existingUser ??
      (
        await db
          .insert(users)
          .values({
            email,
            name: `PW ${label} ${suffix.toUpperCase()}`,
            role,
            orgId: org.id,
            emailVerified: true,
            timezone: "America/New_York",
          })
          .returning()
      )[0];
    seeded[label] = { id: user.id, email: user.email, name: user.name, role: user.role, orgId: org.id };
  }

  return { orgId: org.id, slug: org.slug, admin: seeded.admin, teacher: seeded.teacher, student: seeded.student };
}

/** Seed (or fetch) both fixture organizations. Safe to call repeatedly. */
export async function seedTwoOrgs(): Promise<{ orgA: TestOrg; orgB: TestOrg }> {
  const { db } = testDb();
  const orgA = await seedOrg(db, ORG_SEEDS[0], "a");
  const orgB = await seedOrg(db, ORG_SEEDS[1], "b");
  return { orgA, orgB };
}
