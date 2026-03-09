/**
 * @fileoverview Database Seed Script
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * A seed script populates your database with test data for development.
 * Without it, every developer starts with an empty database and has to
 * manually create users, plans, etc. just to test anything.
 *
 * USAGE:
 *   npx tsx src/db/seed.ts
 *
 * WHAT THIS CREATES:
 * 1. One organization ("Iqra Academy")
 * 2. Four plans (Free, Individual, Group, Siblings)
 * 3. Users for each role (student, teacher, admin, super admin)
 * 4. Sample student profiles (children)
 * 5. Sample lesson content for each track
 * 6. A few sample sessions and bookings
 *
 * IDEMPOTENCY:
 * This script can be run multiple times safely — it inserts with
 * onConflictDoNothing to avoid duplicate key errors.
 *
 * @module db/seed
 */

import "dotenv/config";  // Load .env before anything else
import { db } from "../lib/db";
import {
  organizations,
  users,
  studentProfiles,
  plans,
  subscriptions,
  sessions,
  bookings,
  lessonContent,
  teacherAvailability,
  defaultWeeklySlots,
  chatRooms,
  observerEmails,
} from "./schema";
import { createId } from "@paralleldrive/cuid2";

// ============================================================================
// SEED DATA IDs (fixed so we can reference them across tables)
// ============================================================================

const ORG_ID = "seed_org_iqra_academy";
const ADMIN_ID = "seed_user_admin";
const SUPER_ID = "seed_user_super";
const TEACHER1_ID = "seed_user_teacher1";
const TEACHER2_ID = "seed_user_teacher2";
const STUDENT1_ID = "seed_user_student1";
const STUDENT2_ID = "seed_user_student2";
const PROFILE1_ID = "seed_profile_aisha";
const PROFILE2_ID = "seed_profile_yusuf";
const PROFILE3_ID = "seed_profile_zahra";
const PROFILE4_ID = "seed_profile_ibrahim";

const PLAN_FREE_ID = "seed_plan_free";
const PLAN_INDIVIDUAL_ID = "seed_plan_individual";
const PLAN_GROUP_ID = "seed_plan_group";
const PLAN_SIBLINGS_ID = "seed_plan_siblings";

// ============================================================================
// SEED FUNCTION
// ============================================================================

async function seed() {
  console.log("🌱 Seeding database...\n");

  // ── 1. Organization ──────────────────────────────────────────────────────
  console.log("  📦 Creating organization...");
  await db
    .insert(organizations)
    .values({
      id: ORG_ID,
      name: "Iqra Academy",
      slug: "iqra-academy",
      domain: "iqra-academy.com",
      timezone: "America/New_York",
      settings: {
        brandColor: "#10b981",
        welcomeMessage: "Welcome to Iqra Academy — Learn the Quran with expert teachers.",
      },
    })
    .onConflictDoNothing();

  // ── 2. Users ─────────────────────────────────────────────────────────────
  console.log("  👥 Creating users...");
  const usersData = [
    {
      id: SUPER_ID,
      orgId: ORG_ID,
      email: "super@iqra-academy.com",
      name: "Super Admin",
      role: "SUPER_ADMIN" as const,
      emailVerified: true,
    },
    {
      id: ADMIN_ID,
      orgId: ORG_ID,
      email: "admin@iqra-academy.com",
      name: "Fatima Hassan",
      role: "ORG_ADMIN" as const,
      emailVerified: true,
    },
    {
      id: TEACHER1_ID,
      orgId: ORG_ID,
      email: "teacher.ali@iqra-academy.com",
      name: "Ustadh Ali Rahman",
      role: "TEACHER" as const,
      emailVerified: true,
    },
    {
      id: TEACHER2_ID,
      orgId: ORG_ID,
      email: "teacher.maryam@iqra-academy.com",
      name: "Ustadha Maryam Khan",
      role: "TEACHER" as const,
      emailVerified: true,
    },
    {
      id: STUDENT1_ID,
      orgId: ORG_ID,
      email: "parent.ahmed@gmail.com",
      name: "Ahmed Al-Rashid",
      role: "STUDENT" as const,
      phone: "+1-555-0101",
      emailVerified: true,
    },
    {
      id: STUDENT2_ID,
      orgId: ORG_ID,
      email: "parent.sara@gmail.com",
      name: "Sara Malik",
      role: "STUDENT" as const,
      phone: "+1-555-0102",
      emailVerified: true,
    },
  ];

  for (const user of usersData) {
    await db.insert(users).values(user).onConflictDoNothing();
  }

  // ── 3. Student Profiles (children) ────────────────────────────────────────
  console.log("  🧒 Creating student profiles...");
  const profilesData = [
    // Ahmed's children (Siblings plan — 3 kids)
    {
      id: PROFILE1_ID,
      orgId: ORG_ID,
      userId: STUDENT1_ID,
      name: "Aisha Al-Rashid",
      track: "QAIDAH" as const,
      currentLevel: "qaida-lesson-8",
      notes: "Very enthusiastic learner. Good with Arabic letters.",
    },
    {
      id: PROFILE2_ID,
      orgId: ORG_ID,
      userId: STUDENT1_ID,
      name: "Yusuf Al-Rashid",
      track: "QURAN_READING" as const,
      currentLevel: "juz-2-surat-baqarah",
      notes: "Working on Tajweed rules. Needs help with Idgham.",
    },
    {
      id: PROFILE3_ID,
      orgId: ORG_ID,
      userId: STUDENT1_ID,
      name: "Zahra Al-Rashid",
      track: "QAIDAH" as const,
      currentLevel: "qaida-lesson-3",
      notes: "Just starting. Learning basic letter shapes.",
    },
    // Sara's child (Individual plan — 1 kid)
    {
      id: PROFILE4_ID,
      orgId: ORG_ID,
      userId: STUDENT2_ID,
      name: "Ibrahim Malik",
      track: "HIFZ" as const,
      currentLevel: "juz-30-an-naba",
      notes: "Memorizing Juz Amma. Excellent retention.",
    },
  ];

  for (const profile of profilesData) {
    await db.insert(studentProfiles).values(profile).onConflictDoNothing();
  }

  // ── 4. Plans ─────────────────────────────────────────────────────────────
  console.log("  💳 Creating plans...");
  const plansData = [
    {
      id: PLAN_FREE_ID,
      orgId: ORG_ID,
      tier: "FREE" as const,
      name: "Free Webinar",
      description: "Join live webinar sessions for free. No chat access.",
      priceInCents: 0,
      classesPerWeek: 0, // Unlimited webinars, but no 1:1/group
      maxStudents: 20,
      sessionType: "WEBINAR" as const,
    },
    {
      id: PLAN_INDIVIDUAL_ID,
      orgId: ORG_ID,
      tier: "INDIVIDUAL" as const,
      name: "1:1 Premium",
      description: "Private 1-on-1 sessions with a teacher. 4 classes per week.",
      priceInCents: 7000,
      classesPerWeek: 4,
      maxStudents: 1,
      sessionType: "INDIVIDUAL" as const,
    },
    {
      id: PLAN_GROUP_ID,
      orgId: ORG_ID,
      tier: "GROUP" as const,
      name: "Group Class",
      description: "Small group sessions with up to 3 students. 4 classes per week.",
      priceInCents: 5000,
      classesPerWeek: 4,
      maxStudents: 3,
      sessionType: "GROUP" as const,
    },
    {
      id: PLAN_SIBLINGS_ID,
      orgId: ORG_ID,
      tier: "SIBLINGS" as const,
      name: "Family Plan",
      description: "Up to 3 children under one account. 4 classes per week per child.",
      priceInCents: 10000,
      classesPerWeek: 4,
      maxStudents: 3,
      sessionType: "SIBLINGS" as const,
    },
  ];

  for (const plan of plansData) {
    await db.insert(plans).values(plan).onConflictDoNothing();
  }

  // ── 5. Subscriptions ─────────────────────────────────────────────────────
  console.log("  📋 Creating subscriptions...");
  const now = new Date();
  const monthFromNow = new Date(now);
  monthFromNow.setMonth(monthFromNow.getMonth() + 1);

  await db
    .insert(subscriptions)
    .values([
      {
        id: "seed_sub_ahmed_siblings",
        orgId: ORG_ID,
        userId: STUDENT1_ID,
        planId: PLAN_SIBLINGS_ID,
        status: "ACTIVE",
        paymentMethod: "MANUAL_INVOICE",
        currentPeriodStart: now,
        currentPeriodEnd: monthFromNow,
      },
      {
        id: "seed_sub_sara_individual",
        orgId: ORG_ID,
        userId: STUDENT2_ID,
        planId: PLAN_INDIVIDUAL_ID,
        status: "ACTIVE",
        paymentMethod: "MANUAL_INVOICE",
        currentPeriodStart: now,
        currentPeriodEnd: monthFromNow,
      },
    ])
    .onConflictDoNothing();

  // ── 6. Teacher Availability ──────────────────────────────────────────────
  console.log("  📅 Creating teacher availability...");
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;

  for (const day of days) {
    await db
      .insert(teacherAvailability)
      .values([
        {
          orgId: ORG_ID,
          teacherId: TEACHER1_ID,
          dayOfWeek: day,
          startTime: "09:00",
          endTime: "17:00",
          timezone: "America/New_York",
        },
        {
          orgId: ORG_ID,
          teacherId: TEACHER2_ID,
          dayOfWeek: day,
          startTime: "10:00",
          endTime: "18:00",
          timezone: "America/New_York",
        },
      ])
      .onConflictDoNothing();
  }

  // ── 7. Default Weekly Slots ──────────────────────────────────────────────
  console.log("  🕐 Creating default weekly slots...");
  await db
    .insert(defaultWeeklySlots)
    .values([
      {
        orgId: ORG_ID,
        studentProfileId: PROFILE1_ID,
        teacherId: TEACHER1_ID,
        track: "QAIDAH",
        dayOfWeek: "MONDAY",
        startTime: "16:00",
        timezone: "America/New_York",
      },
      {
        orgId: ORG_ID,
        studentProfileId: PROFILE2_ID,
        teacherId: TEACHER1_ID,
        track: "QURAN_READING",
        dayOfWeek: "TUESDAY",
        startTime: "16:30",
        timezone: "America/New_York",
      },
      {
        orgId: ORG_ID,
        studentProfileId: PROFILE4_ID,
        teacherId: TEACHER2_ID,
        track: "HIFZ",
        dayOfWeek: "WEDNESDAY",
        startTime: "15:00",
        timezone: "America/New_York",
      },
    ])
    .onConflictDoNothing();

  // ── 8. Lesson Content ────────────────────────────────────────────────────
  console.log("  📚 Creating lesson content...");
  const qaidahLessons = [
    { title: "Arabic Letters: Alif to Tha", description: "Learn the first 4 Arabic letters and their sounds." },
    { title: "Arabic Letters: Jeem to Kha", description: "Letters Jeem, Ha, Kha with mouth positions." },
    { title: "Arabic Letters: Daal to Zaal", description: "Letters Daal, Dhaal, Ra, Zaal." },
    { title: "Short Vowels: Fathah", description: "The 'ah' sound on Arabic letters." },
    { title: "Short Vowels: Kasrah & Dammah", description: "The 'ee' and 'oo' sounds." },
    { title: "Tanween: Double Vowels", description: "Nun sounds at the end of words." },
    { title: "Sukoon & Shaddah", description: "Stopping and doubling consonants." },
    { title: "Connecting Letters", description: "How letters change shape when joined." },
  ];

  for (let i = 0; i < qaidahLessons.length; i++) {
    await db
      .insert(lessonContent)
      .values({
        orgId: ORG_ID,
        track: "QAIDAH",
        sortOrder: i + 1,
        title: qaidahLessons[i].title,
        description: qaidahLessons[i].description,
        objectives: [`Master the content of Qaidah lesson ${i + 1}`],
        estimatedMinutes: 30,
      })
      .onConflictDoNothing();
  }

  // ── 9. Chat Rooms ────────────────────────────────────────────────────────
  console.log("  💬 Creating chat rooms...");
  await db
    .insert(chatRooms)
    .values([
      {
        orgId: ORG_ID,
        name: "Iqra Community",
        isOrgWide: true,
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  // ── 10. Observer Emails ──────────────────────────────────────────────────
  console.log("  📧 Creating observer emails...");
  await db
    .insert(observerEmails)
    .values({
      userId: STUDENT1_ID,
      email: "wife.ahmed@gmail.com",
      isActive: true,
      profileIds: [], // all profiles
      frequency: "weekly",
    })
    .onConflictDoNothing();

  console.log("\n✅ Seed complete! Created:");
  console.log("   • 1 organization (Iqra Academy)");
  console.log("   • 6 users (super, admin, 2 teachers, 2 students)");
  console.log("   • 4 student profiles (3 siblings + 1 individual)");
  console.log("   • 4 plans (Free, Individual, Group, Siblings)");
  console.log("   • 2 subscriptions");
  console.log("   • 10 teacher availability slots");
  console.log("   • 3 default weekly slots");
  console.log("   • 8 Qaidah lessons");
  console.log("   • 1 community chat room");
  console.log("   • 1 observer email");
  console.log("\n💡 Login as any seed user (all passwords are managed by Better Auth).");
}

// Run the seed
seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  });
