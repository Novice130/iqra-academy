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

import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ws from "ws";
import { eq, and } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { organizations, users, authSessions } from "../../src/db/schema";
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

type Db = NeonDatabase<typeof schema> | ReturnType<typeof drizzlePostgresJs<typeof schema>>;

const ORG_SEEDS = [
  { slug: "pw-org-a", name: "Playwright Org A" },
  { slug: "pw-org-b", name: "Playwright Org B" },
] as const;

const ROLE_SEEDS = [
  { role: "ORG_ADMIN", label: "admin" },
  { role: "TEACHER", label: "teacher" },
  { role: "STUDENT", label: "student" },
] as const;

type TestPool = Pool | { end: () => Promise<void> };

let sharedDb: { db: Db; pool: TestPool; sql?: ReturnType<typeof postgres> } | null = null;

function isLocalPgUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host === ""
    );
  } catch {
    return false;
  }
}

function testDb(): { db: Db; pool: TestPool; sql?: ReturnType<typeof postgres> } {
  if (!sharedDb) {
    requireIsolatedDb("playwright-fixtures");
    const connectionString = process.env.DATABASE_URL!;
    // @neondatabase/serverless speaks the Neon wire protocol over
    // WebSockets; it cannot open a plain-TCP session to a local Postgres
    // (docs/testing.md Option B). `postgres` (postgres-js) is already a
    // runtime dependency, so route localhost fixtures through it and keep
    // the Neon pool for isolated Neon branches.
    if (isLocalPgUrl(connectionString)) {
      const sql = postgres(connectionString);
      sharedDb = { db: drizzlePostgresJs(sql, { schema }), pool: { end: async () => { await sql.end({ timeout: 2 }); } }, sql };
    } else {
      const pool = new Pool({ connectionString });
      sharedDb = { db: drizzleNeon(pool, { schema }), pool };
    }
  }
  return sharedDb;
}

export async function closeTestDb(): Promise<void> {
  if (sharedDb) {
    await sharedDb.pool?.end?.().catch(() => {});
    await sharedDb.sql?.end?.({ timeout: 2 }).catch(() => {});
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

export function getTestDb(): { db: Db; pool: TestPool } {
  return testDb();
}

export async function createTestSession(userId: string): Promise<string> {
  const { db } = testDb();
  const token = `test-token-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(authSessions).values({
    id,
    userId,
    token,
    expiresAt,
  });

  // Better Auth reads the session cookie via getSignedCookie: the raw token
  // plus "." + base64(HMAC-SHA256(secret, token)) (better-call's
  // signCookieValue / better-auth's makeSignature — same algorithm). The
  // fixture DB row holds the raw token; the cookie must carry
  // token.signature or every seeded request 401s (the dev server and the
  // fixture share neither secret storage nor signer).
  // Playwright sends the Cookie header raw, so no encodeURIComponent.
  // Signed inline with WebCrypto (same algorithm as better-call) because
  // better-call/crypto is not in its exports map.
  // NOTE: the app server itself runs @neondatabase/serverless (WebSocket +
  // HTTP drivers), which cannot speak to a plain-TCP local Postgres
  // (docs/testing.md Option B). Seeded suites therefore need an isolated
  // *Neon branch*, not localhost — localhost only proves the fixture signs
  // and seeds correctly. The unsigned raw token is returned when no
  // BETTER_AUTH_SECRET is set.
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) {
    const subtle =
      globalThis.crypto?.subtle ??
      (await import("node:crypto")).webcrypto.subtle;
    const key = await subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await subtle.sign("HMAC", key, new TextEncoder().encode(token));
    const b64 = Buffer.from(sig).toString("base64");
    return `${token}.${b64}`;
  }
  return token;
}

