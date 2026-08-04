import { db } from "../src/lib/db";
import { users, studentProfiles, sessions, bookings, progressRecords, authSessions, defaultWeeklySlots, teacherAvailability, subscriptions, observerEmails, accounts } from "../src/db/schema";
import { eq, inArray, notInArray } from "drizzle-orm";

async function run() {
  console.log("Cleaning fake data and assigning classes to Masad Shareef...");

  // 1. Get Masad Shareef's ID
  const masad = await db.query.users.findFirst({
    where: eq(users.email, "masadshareef1973@gmail.com")
  });
  if (!masad) throw new Error("Masad Shareef user not found.");

  console.log(`Found Masad Shareef user ID: ${masad.id}`);

  // 2. Re-assign all existing scheduled sessions to Masad Shareef
  const updatedSessions = await db.update(sessions)
    .set({ teacherId: masad.id })
    .where(eq(sessions.status, "SCHEDULED"));

  console.log(`Re-assigned scheduled sessions to Masad Shareef.`);

  // 3. Define Real User Emails to Keep
  const realEmails = [
    "syedamer130@gmail.com",
    "subedar2017info@gmail.com",
    "masadshareef1973@gmail.com",
    "bkyt@test.com",
    "sobur@test.com",
    "malek@test.com"
  ];

  // Get fake users
  const fakeUsers = await db.query.users.findMany({
    where: notInArray(users.email, realEmails)
  });
  const fakeUserIds = fakeUsers.map(u => u.id);

  console.log(`Found ${fakeUserIds.length} fake users to remove.`);

  if (fakeUserIds.length > 0) {
    // Delete progress records for fake students
    const fakeProfiles = await db.query.studentProfiles.findMany({
      where: inArray(studentProfiles.userId, fakeUserIds)
    });
    const fakeProfileIds = fakeProfiles.map(p => p.id);

    if (fakeProfileIds.length > 0) {
      await db.delete(progressRecords).where(inArray(progressRecords.studentProfileId, fakeProfileIds));
      await db.delete(bookings).where(inArray(bookings.studentProfileId, fakeProfileIds));
      await db.delete(defaultWeeklySlots).where(inArray(defaultWeeklySlots.studentProfileId, fakeProfileIds));
      await db.delete(studentProfiles).where(inArray(studentProfiles.id, fakeProfileIds));
    }

    // Delete fake user sessions / bookings / authSessions / availability / subscriptions
    const fakeSessions = await db.query.sessions.findMany({
      where: inArray(sessions.teacherId, fakeUserIds)
    });
    const fakeSessionIds = fakeSessions.map(s => s.id);
    if (fakeSessionIds.length > 0) {
      await db.delete(bookings).where(inArray(bookings.sessionId, fakeSessionIds));
      await db.delete(sessions).where(inArray(sessions.id, fakeSessionIds));
    }

    await db.delete(observerEmails).where(inArray(observerEmails.userId, fakeUserIds));
    await db.delete(teacherAvailability).where(inArray(teacherAvailability.teacherId, fakeUserIds));
    await db.delete(subscriptions).where(inArray(subscriptions.userId, fakeUserIds));
    await db.delete(accounts).where(inArray(accounts.userId, fakeUserIds));
    await db.delete(authSessions).where(inArray(authSessions.userId, fakeUserIds));
    await db.delete(users).where(inArray(users.id, fakeUserIds));
  }

  console.log("Cleanup finished successfully!");
}

run().then(() => process.exit(0)).catch(e => {
  console.error("Error running clean_and_assign:", e);
  process.exit(1);
});
