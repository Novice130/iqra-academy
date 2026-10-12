/**
 * Creates the accounts loadtest/locustfile.py signs in as.
 *
 *   LOADTEST_PASSWORD='...' LOADTEST_TEACHERS=5 LOADTEST_STUDENTS=20 \
 *     npx tsx scripts/create-loadtest-accounts.ts
 *
 * Every address ends in @loadtest.invalid, so the rows are easy to find and can
 * never reach a real mailbox. Staging or a local database only: the guard
 * below refuses the shared Neon endpoints.
 *
 * Safe to re-run: existing accounts are reported and skipped, never reset.
 */

import "dotenv/config";
import { requireIsolatedDb } from "./lib/require-isolated-db";

requireIsolatedDb("create-loadtest-accounts");

import { auth } from "../src/lib/auth";
import { db, withDb } from "../src/lib/db";
import { organizations, users, studentProfiles } from "../src/db/schema";
import { eq } from "drizzle-orm";

const ORG_ID = "seed_org_iqra_academy";

const PASSWORD = process.env.LOADTEST_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  console.error("Set LOADTEST_PASSWORD (8+ characters) before running this.");
  process.exit(1);
}

const teachers = Number(process.env.LOADTEST_TEACHERS ?? 5);
const students = Number(process.env.LOADTEST_STUDENTS ?? 20);

const pad = (n: number) => String(n).padStart(3, "0");
const accountsToCreate = [
  ...Array.from({ length: teachers }, (_, i) => ({
    email: `lt-teacher-${pad(i + 1)}@loadtest.invalid`,
    name: `Loadtest Teacher ${pad(i + 1)}`,
    role: "TEACHER" as const,
  })),
  ...Array.from({ length: students }, (_, i) => ({
    email: `lt-student-${pad(i + 1)}@loadtest.invalid`,
    name: `Loadtest Student ${pad(i + 1)}`,
    role: "STUDENT" as const,
  })),
];

async function main() {
  await withDb(async () => {
    // An empty database (a fresh local one) has no organisation yet.
    await db
      .insert(organizations)
      .values({ id: ORG_ID, name: "Iqra Academy", slug: "iqra-academy" })
      .onConflictDoNothing();

    for (const acc of accountsToCreate) {
      const existing = await db.query.users.findFirst({ where: eq(users.email, acc.email) });
      if (existing) {
        console.log(`~ ${acc.email} already exists, left alone`);
        continue;
      }

      const res = await auth.api.signUpEmail({
        body: { email: acc.email, password: PASSWORD!, name: acc.name },
      });
      if (!res?.user) {
        console.error(`x ${acc.email}: sign-up returned no user`);
        continue;
      }

      await db
        .update(users)
        .set({ role: acc.role, orgId: ORG_ID, emailVerified: true, timezone: "America/New_York" })
        .where(eq(users.id, res.user.id));

      if (acc.role === "STUDENT") {
        await db
          .insert(studentProfiles)
          .values({
            orgId: ORG_ID,
            userId: res.user.id,
            name: acc.name,
            track: "QAIDAH",
            currentLevel: "qaida-lesson-1",
          })
          .onConflictDoNothing();
      }

      console.log(`+ ${acc.email} (${acc.role})`);
    }
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
