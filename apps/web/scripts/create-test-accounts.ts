/**
 * Creates the standing test accounts: one teacher, three students.
 *
 *   TEST_ACCOUNT_PASSWORD='...' npx tsx scripts/create-test-accounts.ts
 *
 * The password comes from the environment on purpose. The older
 * `create-users.ts` has real account passwords in the file, which means
 * anyone with repo access has them — don't repeat that here.
 *
 * Safe to re-run: existing accounts are reported and skipped, never reset.
 *
 * The three students deliberately sit in three different time zones. Class
 * times are stored as instants and rendered per viewer, and the only way that
 * ever gets tested properly is if the test accounts disagree about what time
 * it is. See docs/timezones.md.
 */

import "dotenv/config";
import { requireIsolatedDb } from "./lib/require-isolated-db";

requireIsolatedDb("create-test-accounts");

import { auth } from "../src/lib/auth";
import { db, withDb } from "../src/lib/db";
import { users, studentProfiles, teacherAvailability } from "../src/db/schema";
import { eq } from "drizzle-orm";

const ORG_ID = "seed_org_iqra_academy";

const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  console.error("Set TEST_ACCOUNT_PASSWORD (8+ characters) before running this.");
  process.exit(1);
}

const accountsToCreate = [
  { email: "testteacher@test.com", name: "Test Teacher", role: "TEACHER" as const, timezone: "Asia/Kolkata" },
  { email: "teststudent1@test.com", name: "Test Student One", role: "STUDENT" as const, timezone: "America/Chicago" },
  { email: "teststudent2@test.com", name: "Test Student Two", role: "STUDENT" as const, timezone: "America/New_York" },
  { email: "teststudent3@test.com", name: "Test Student Three", role: "STUDENT" as const, timezone: "Asia/Kolkata" },
];

// Every db access has to run inside withDb — the connection lives in an
// AsyncLocalStorage store, because Workers can't reuse a pool across requests.
async function main() {
  await withDb(async () => {
  for (const acc of accountsToCreate) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, acc.email) });
    if (existing) {
      console.log(`~ ${acc.email} already exists (${existing.id}) — left alone`);
      continue;
    }

    const res = await auth.api.signUpEmail({
      body: { email: acc.email, password: PASSWORD!, name: acc.name },
    });
    if (!res?.user) {
      console.error(`x ${acc.email} — sign-up returned no user`);
      continue;
    }

    await db
      .update(users)
      .set({ role: acc.role, orgId: ORG_ID, emailVerified: true, timezone: acc.timezone })
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

    if (acc.role === "TEACHER") {
      const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
      for (const day of days) {
        await db
          .insert(teacherAvailability)
          .values({
            orgId: ORG_ID,
            teacherId: res.user.id,
            dayOfWeek: day,
            startTime: "00:00",
            endTime: "23:59",
            timezone: acc.timezone,
          })
          .onConflictDoNothing();
      }
    }

    console.log(`+ ${acc.email} (${acc.role}, ${acc.timezone}) — ${res.user.id}`);
  }
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
