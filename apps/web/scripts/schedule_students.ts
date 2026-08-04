import { db } from "../src/lib/db";
import { users, studentProfiles, sessions, bookings, defaultWeeklySlots } from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { addDays, setHours, setMinutes, startOfWeek, addWeeks, format } from "date-fns";

async function run() {
  console.log("Setting up roles and schedules...");

  // 1. Update Roles to ORG_ADMIN
  const targetEmails = ["syedamer130@gmail.com", "subedar2017info@gmail.com"];
  await db.update(users)
    .set({ role: "ORG_ADMIN" })
    .where(inArray(users.email, targetEmails));
  
  console.log("Updated syedamer130@gmail.com and subedar2017info@gmail.com to ORG_ADMIN.");

  const teacher = await db.query.users.findFirst({
    where: eq(users.email, "syedamer130@gmail.com")
  });
  if (!teacher) throw new Error("Teacher not found");

  // Find the three students
  const studentEmails = ["bkyt@test.com", "sobur@test.com", "malek@test.com"];
  const studentUsers = await db.query.users.findMany({
    where: inArray(users.email, studentEmails)
  });

  const profiles = await db.query.studentProfiles.findMany({
    where: inArray(studentProfiles.userId, studentUsers.map(u => u.id))
  });

  if (profiles.length === 0) {
    throw new Error("No student profiles found for the target emails.");
  }

  const orgId = teacher.orgId || "seed_org_iqra_academy";
  const timezone = "America/New_York"; // Assuming standard timezone for now

  // Days: Monday (1), Tuesday (2), Wednesday (3), Thursday (4)
  const targetDays = [1, 2, 3, 4];
  const now = new Date();
  
  // Create sessions for the next 4 weeks
  for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
    const currentWeekStart = addWeeks(startOfWeek(now, { weekStartsOn: 1 }), weekOffset); // Start from Monday

    for (const dayOffset of targetDays) {
      // Day is offset from Monday (0 to 3)
      const sessionDate = addDays(currentWeekStart, dayOffset - 1);
      
      // 4:30 AM
      const startTime = setMinutes(setHours(sessionDate, 4), 30);
      // 6:35 AM
      const endTime = setMinutes(setHours(sessionDate, 6), 35);

      // Only schedule if in the future
      if (endTime < now && weekOffset === 0) continue;

      const sessionId = createId();

      await db.insert(sessions).values({
        id: sessionId,
        orgId,
        teacherId: teacher.id,
        type: "GROUP", // All 3 students in one 2-hour session
        status: "SCHEDULED",
        title: "Morning Group Class",
        scheduledStart: startTime,
        scheduledEnd: endTime,
        consumesQuota: true,
      });

      // Create bookings for all 3 students
      for (const profile of profiles) {
        await db.insert(bookings).values({
          id: createId(),
          orgId,
          userId: profile.userId,
          studentProfileId: profile.id,
          sessionId,
          status: "CONFIRMED",
        });
      }

      console.log(`Created Session: ${format(startTime, "MMM d, yyyy h:mm a")} to ${format(endTime, "h:mm a")}`);
    }
  }

  console.log("Successfully created schedules for the next 4 weeks.");
}

run().then(() => process.exit(0)).catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
