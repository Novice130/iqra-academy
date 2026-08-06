/**
 * Sets up a class for the test accounts, in the shape that actually breaks:
 * one GROUP row for the teacher *plus* one INDIVIDUAL row per student, all at
 * the same slot. That is how the real 2026-08-06 class was booked, and it is
 * what split three students into three rooms — every dashboard links at a
 * different row. See docs/integration-livekit.md § One class, one room.
 *
 *   npx tsx scripts/create-test-class.ts [minutesFromNow]
 *
 * Defaults to 10 minutes out, which is inside the window where the room opens
 * and "Start Class" resumes rather than creating something new.
 *
 * Re-running replaces the previous test class. Remove it with:
 *   npx tsx scripts/create-test-class.ts --clean
 */

import "dotenv/config";
import { db, withDb } from "../src/lib/db";
import { bookings, sessions, studentProfiles, users } from "../src/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const ORG_ID = "seed_org_iqra_academy";
const TEACHER = "testteacher@test.com";
const STUDENTS = ["teststudent1@test.com", "teststudent2@test.com", "teststudent3@test.com"];
/** Shared prefix so a re-run (or --clean) can find what it made last time. */
const ID_PREFIX = "testclass_";

async function clean() {
  const rows = await db.query.sessions.findMany({ where: like(sessions.id, `${ID_PREFIX}%`) });
  if (rows.length === 0) return console.log("nothing to clean");
  const ids = rows.map((r) => r.id);
  await db.delete(bookings).where(inArray(bookings.sessionId, ids));
  await db.delete(sessions).where(inArray(sessions.id, ids));
  console.log(`removed ${ids.length} test sessions`);
}

async function main() {
  const arg = process.argv[2];

  await withDb(async () => {
    await clean();
    if (arg === "--clean") return;

    const minutes = Number(arg ?? 10);
    const start = new Date(Date.now() + minutes * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const teacher = await db.query.users.findFirst({ where: eq(users.email, TEACHER) });
    if (!teacher) throw new Error(`${TEACHER} not found — run create-test-accounts.ts first`);

    const make = async (id: string, type: "GROUP" | "INDIVIDUAL", title: string) => {
      await db.insert(sessions).values({
        id,
        orgId: ORG_ID,
        teacherId: teacher.id,
        type,
        status: "SCHEDULED",
        title,
        scheduledStart: start,
        scheduledEnd: end,
        consumesQuota: false,
      });
      return id;
    };

    const groupId = await make(`${ID_PREFIX}group`, "GROUP", "Test Group Class");

    for (const [i, email] of STUDENTS.entries()) {
      const student = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (!student) {
        console.log(`~ ${email} missing, skipped`);
        continue;
      }
      const profile = await db.query.studentProfiles.findFirst({
        where: eq(studentProfiles.userId, student.id),
      });
      if (!profile) {
        console.log(`~ ${email} has no student profile, skipped`);
        continue;
      }

      const soloId = await make(`${ID_PREFIX}solo_${i + 1}`, "INDIVIDUAL", `Test 1-on-1 (${student.name})`);

      // Booked on both: their own row, which is what their dashboard links at,
      // and the group row everyone should converge on.
      for (const sessionId of [soloId, groupId]) {
        await db.insert(bookings).values({
          id: createId(),
          orgId: ORG_ID,
          userId: student.id,
          studentProfileId: profile.id,
          sessionId,
          status: "CONFIRMED",
        });
      }
      console.log(`+ ${student.name}: ${soloId}`);
    }

    console.log(`\nGroup class: ${groupId}`);
    console.log(`Starts ${start.toISOString()} (in ${minutes} min)`);
    console.log(`Everyone should end up in room qlms-<whichever row wins>; check they all match.`);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
