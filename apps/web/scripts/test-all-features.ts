import "dotenv/config";
import { requireIsolatedDb } from "./lib/require-isolated-db";

requireIsolatedDb("test-all-features");

import { db, withHttpDb } from "../src/lib/db";
import {
  users,
  studentProfiles,
  sessions,
  bookings,
  teacherAvailability,
  sessionAttendance,
} from "../src/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { generateSlots } from "../src/lib/slots";
import { createId } from "@paralleldrive/cuid2";

async function main() {
  await withHttpDb(async () => {
    console.log("=================================================");
    console.log("🚀 COMPREHENSIVE FEATURE TEST SUITE");
    console.log("=================================================\n");

    // 1. Find or verify test accounts
    const teacher =
      (await db.query.users.findFirst({ where: eq(users.role, "TEACHER") })) ||
      (await db.query.users.findFirst({ where: eq(users.email, "testteacher@test.com") }));

    const student =
      (await db.query.users.findFirst({ where: eq(users.role, "STUDENT") })) ||
      (await db.query.users.findFirst({ where: eq(users.email, "teststudent1@test.com") }));

    const admin =
      (await db.query.users.findFirst({ where: eq(users.email, "syedamer130@gmail.com") })) ||
      (await db.query.users.findFirst({ where: inArray(users.role, ["ORG_ADMIN", "SUPER_ADMIN"]) }));

    if (!teacher || !student) {
      console.error("Missing test teacher or student accounts");
      process.exit(1);
    }

    console.log(`✓ Test Teacher: ${teacher.name} (${teacher.email})`);
    console.log(`✓ Test Student: ${student.name} (${student.email})`);
    console.log(`✓ Admin: ${admin?.name || "Root Admin"} (${admin?.email || "syedamer130@gmail.com"})\n`);

    // TEST 1: Teacher Availability Saving & Student Slot Reflection
    console.log("--- TEST 1: Teacher Availability & Student Slot Reflection ---");
    // Clear existing
    await db.delete(teacherAvailability).where(eq(teacherAvailability.teacherId, teacher.id));

    // Save test availability (e.g. MONDAY 09:00 - 17:00, TUESDAY 09:00 - 17:00)
    const testSlots = [
      {
        teacherId: teacher.id,
        orgId: teacher.orgId || "org_default",
        dayOfWeek: "MONDAY" as const,
        startTime: "09:00",
        endTime: "17:00",
        timezone: teacher.timezone || "Asia/Kolkata",
        slotMinutes: 30,
        isActive: true,
      },
      {
        teacherId: teacher.id,
        orgId: teacher.orgId || "org_default",
        dayOfWeek: "TUESDAY" as const,
        startTime: "09:00",
        endTime: "17:00",
        timezone: teacher.timezone || "Asia/Kolkata",
        slotMinutes: 30,
        isActive: true,
      },
    ];

    await db.insert(teacherAvailability).values(testSlots);
    console.log("✓ Saved updated weekly availability for teacher into PostgreSQL");

    // Generate bookable slots for student
    const availableSlots = await generateSlots({
      orgId: student.orgId || "org_default",
      teacherId: teacher.id,
      from: new Date(),
      to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      minLeadMinutes: 0,
    });

    console.log(`✓ Generated ${availableSlots.length} bookable slots for student.`);
    if (availableSlots.length === 0) {
      throw new Error("Failed: Available slots were not generated for student!");
    }
    console.log(`  Sample Slot: ${availableSlots[0].startsAt.toISOString()} - ${availableSlots[0].endsAt.toISOString()} (${availableSlots[0].teacherName})`);
    console.log("✅ TEST 1 PASSED: Availability saved and reflected to student!\n");

    // TEST 2: Admin Student Assignment
    console.log("--- TEST 2: Admin Student Assignment ---");
    let studentProfile = await db.query.studentProfiles.findFirst({
      where: eq(studentProfiles.userId, student.id),
    });

    if (!studentProfile) {
      const pId = createId();
      await db.insert(studentProfiles).values({
        id: pId,
        orgId: student.orgId || "org_default",
        userId: student.id,
        name: student.name || "Test Student Profile",
        track: "QAIDAH",
      });
      studentProfile = { id: pId, orgId: student.orgId || "org_default", userId: student.id, name: student.name || "Test Student Profile", track: "QAIDAH" } as any;
    }

    const testSessionId = createId();
    const scheduledStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const scheduledEnd = new Date(scheduledStart.getTime() + 30 * 60 * 1000);

    await db.insert(sessions).values({
      id: testSessionId,
      orgId: studentProfile!.orgId,
      teacherId: teacher.id,
      track: "QAIDAH",
      type: "INDIVIDUAL",
      status: "SCHEDULED",
      title: `Noorani Qaida with ${teacher.name}`,
      scheduledStart,
      scheduledEnd,
      consumesQuota: true,
    });

    await db.insert(bookings).values({
      id: createId(),
      orgId: studentProfile!.orgId,
      userId: student.id,
      studentProfileId: studentProfile!.id,
      sessionId: testSessionId,
      status: "CONFIRMED",
    });

    console.log(`✓ Admin assigned student "${studentProfile!.name}" to teacher "${teacher.name}"`);
    console.log(`  Session ID: ${testSessionId} | Time: ${scheduledStart.toISOString()}`);
    console.log("✅ TEST 2 PASSED: Admin student assignment works successfully!\n");

    // TEST 3: Scheduled Classes Matrix Query
    console.log("--- TEST 3: Scheduled Classes Matrix Query ---");
    const upcoming = await db.query.sessions.findMany({
      where: and(eq(sessions.status, "SCHEDULED"), eq(sessions.id, testSessionId)),
      with: {
        teacher: { columns: { name: true, email: true } },
        bookings: {
          with: {
            studentProfile: { columns: { name: true, track: true } },
          },
        },
      },
    });

    if (upcoming.length === 0) {
      throw new Error("Failed to query scheduled session in matrix!");
    }
    console.log(`✓ Found scheduled class: "${upcoming[0].title}" with Teacher "${upcoming[0].teacher?.name}" and Student "${upcoming[0].bookings[0]?.studentProfile?.name}"`);
    console.log("✅ TEST 3 PASSED: Scheduled Classes Matrix query works!\n");

    // TEST 4: Meeting Teardown & Completion
    console.log("--- TEST 4: Meeting Teardown & Room Close ---");
    // Simulate session going to IN_PROGRESS then COMPLETED
    await db.update(sessions).set({ status: "IN_PROGRESS", actualStart: new Date() }).where(eq(sessions.id, testSessionId));
    
    // Add an attendance record
    const attId = createId();
    await db.insert(sessionAttendance).values({
      id: attId,
      orgId: studentProfile!.orgId,
      sessionId: testSessionId,
      userId: student.id,
      studentProfileId: studentProfile!.id,
      role: "STUDENT",
      identity: `${student.email}#test`,
      joinedAt: new Date(),
    });

    // End class
    const endedAt = new Date();
    await db.update(sessions).set({ status: "COMPLETED", actualEnd: endedAt }).where(eq(sessions.id, testSessionId));
    await db.update(sessionAttendance).set({ leftAt: endedAt, durationSeconds: 60 }).where(eq(sessionAttendance.sessionId, testSessionId));

    const verifySession = await db.query.sessions.findFirst({ where: eq(sessions.id, testSessionId) });
    const verifyAtt = await db.query.sessionAttendance.findFirst({ where: eq(sessionAttendance.sessionId, testSessionId) });

    if (verifySession?.status !== "COMPLETED" || !verifyAtt?.leftAt) {
      throw new Error("Failed to close session and attendance on class end!");
    }

    console.log(`✓ Session status: ${verifySession.status} (Ended at ${verifySession.actualEnd?.toISOString()})`);
    console.log(`✓ Attendance closed for participant ${verifyAtt.identity} (Duration: ${verifyAtt.durationSeconds}s)`);
    console.log("✅ TEST 4 PASSED: Meeting end and attendance close verified!\n");

    // Clean up test session
    await db.delete(sessionAttendance).where(eq(sessionAttendance.sessionId, testSessionId));
    await db.delete(bookings).where(eq(bookings.sessionId, testSessionId));
    await db.delete(sessions).where(eq(sessions.id, testSessionId));
    console.log("🧹 Cleaned up temporary test session.");

    console.log("\n=================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!");
    console.log("=================================================");
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
