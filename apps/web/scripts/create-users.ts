import "dotenv/config";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { users, studentProfiles, teacherAvailability } from "../src/db/schema";
import { eq } from "drizzle-orm";

const ORG_ID = "seed_org_iqra_academy";

const accountsToCreate = [
  // Students
  { email: "bkyt@test.com", password: "Login456..", name: "Bkyt Student", role: "STUDENT" as const },
  { email: "sobur@test.com", password: "Login456..", name: "Sobur Student", role: "STUDENT" as const },
  { email: "malek@test.com", password: "Login456..", name: "Malek Student", role: "STUDENT" as const },

  // Teachers
  { email: "syedamer130@gmail.com", password: "Login456..", name: "Syed Amer", role: "TEACHER" as const },
  { email: "masadshareef1973@gmail.com", password: "Login456..", name: "Masad Shareef", role: "TEACHER" as const },
  { email: "subedar2017info@gmail.com", password: "Login456..", name: "Subedar Teacher", role: "TEACHER" as const },
];

async function main() {
  console.log("🚀 Creating test users in Neon DB...\n");

  for (const acc of accountsToCreate) {
    try {
      console.log(`Creating user: ${acc.email} (${acc.role})...`);
      
      const res = await auth.api.signUpEmail({
        body: {
          email: acc.email,
          password: acc.password,
          name: acc.name,
        },
      });

      if (res && res.user) {
        console.log(`  ✅ Auth account created ID: ${res.user.id}`);

        await db
          .update(users)
          .set({
            role: acc.role,
            orgId: ORG_ID,
            emailVerified: true,
          })
          .where(eq(users.id, res.user.id));

        if (acc.role === "STUDENT") {
          await db.insert(studentProfiles).values({
            orgId: ORG_ID,
            userId: res.user.id,
            name: acc.name,
            track: "QAIDAH",
            currentLevel: "qaida-lesson-1",
          }).onConflictDoNothing();
          console.log(`  ✅ Student profile created`);
        }

        if (acc.role === "TEACHER") {
          const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
          for (const day of days) {
            await db.insert(teacherAvailability).values({
              orgId: ORG_ID,
              teacherId: res.user.id,
              dayOfWeek: day,
              startTime: "00:00",
              endTime: "23:59",
              timezone: "America/New_York",
            }).onConflictDoNothing();
          }
          console.log(`  ✅ Teacher availability created`);
        }
      }
    } catch (err: any) {
      if (err?.message?.includes("already exists") || err?.code === "USER_ALREADY_EXISTS") {
        console.log(`  ℹ️  User ${acc.email} already exists.`);
      } else {
        console.error(`  ❌ Failed to create ${acc.email}:`, err?.message || err?.statusText || err);
      }
    }
  }

  console.log("\n🎉 Account creation complete!");
  process.exit(0);
}

main().catch(console.error);
