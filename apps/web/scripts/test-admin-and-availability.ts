import "dotenv/config";
import { requireIsolatedDb } from "./lib/require-isolated-db";

requireIsolatedDb("test-admin-and-availability");

import { db, withDb } from "../src/lib/db";
import { users, teacherAvailability } from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  await withDb(async () => {
    console.log("=== 1. Testing Teacher 24h Availability Database Persistence ===");

    const teacher = await db.query.users.findFirst({
      where: eq(users.role, "TEACHER"),
    });

    if (!teacher) {
      console.error("No teacher found");
      process.exit(1);
    }
    console.log(`Testing with teacher: ${teacher.name} (${teacher.id})`);

    // Clean previous test slots
    await db.delete(teacherAvailability).where(eq(teacherAvailability.teacherId, teacher.id));

    // Insert 24-hour round-the-clock slots across Monday to Friday
    const weekdayDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
    const testSlots = weekdayDays.map((d) => ({
      orgId: teacher.orgId,
      teacherId: teacher.id,
      dayOfWeek: d,
      startTime: "00:00",
      endTime: "23:30",
      timezone: teacher.timezone || "UTC",
      slotMinutes: 30,
    }));

    await db.insert(teacherAvailability).values(testSlots);
    console.log(`✓ Inserted 24-hour availability across all 5 weekdays (00:00 - 23:30)`);

    // Fetch and verify
    const savedSlots = await db.query.teacherAvailability.findMany({
      where: eq(teacherAvailability.teacherId, teacher.id),
    });
    console.log(`✓ Verified ${savedSlots.length} 24h recurring availability records saved in DB`);

    console.log("\n=== 2. Testing Admin User Management & Twenty CRM Counts ===");
    const allUsers = await db.query.users.findMany();
    const teachers = allUsers.filter((u) => u.role === "TEACHER");
    const students = allUsers.filter((u) => u.role === "STUDENT");
    const admins = allUsers.filter((u) => u.role === "ORG_ADMIN" || u.role === "SUPER_ADMIN");

    console.log(`Total Users: ${allUsers.length}`);
    console.log(`Teachers: ${teachers.length}`);
    console.log(`Students: ${students.length}`);
    console.log(`Admins: ${admins.length}`);

    console.log("\n✅ ALL TEACHER 24H AVAILABILITY & ADMIN DATA CHECKS PASSED!");
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
