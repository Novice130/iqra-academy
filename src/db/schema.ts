/**
 * @fileoverview Drizzle ORM Schema — Quran Learning Management System
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * This file defines the entire database structure using Drizzle ORM.
 * Unlike Prisma (which uses its own DSL), Drizzle schemas are pure TypeScript.
 * This means you get full IDE support, type inference, and can use
 * any TypeScript features (loops, conditionals, etc.) in your schema.
 *
 * KEY DESIGN DECISIONS:
 * - Every tenant-scoped table has `orgId` — multi-tenant pattern.
 * - Ledger pattern for quotas — track each booking event for auditability.
 * - Soft deletes (deletedAt) on critical tables.
 * - All IDs use `cuid()` — URL-safe, collision-resistant, sortable.
 * - Tracks (Qaidah, Quran Reading, Hifz) are first-class on profiles & content.
 *
 * @module db/schema
 */

import { relations } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  timestamp,
  json,
  uniqueIndex,
  index,
  smallint,
  time,
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// ============================================================================
// ENUMS
// ============================================================================

/**
 * User roles — ordered by increasing privilege.
 * 📚 STUDENT < TEACHER < ORG_ADMIN < SUPER_ADMIN
 */
export const userRoleEnum = pgEnum("UserRole", [
  "STUDENT",
  "TEACHER",
  "ORG_ADMIN",
  "SUPER_ADMIN",
]);

/**
 * Quran learning tracks.
 * - QAIDAH: Basic Arabic letter recognition and pronunciation rules.
 * - QURAN_READING: Reading the Quran with Tajweed (correct pronunciation).
 * - HIFZ: Memorization of the Quran (chapters/juz).
 */
export const trackEnum = pgEnum("Track", [
  "QAIDAH",
  "QURAN_READING",
  "HIFZ",
]);

/**
 * Session types with different rules:
 * - INDIVIDUAL: 1 teacher + 1 student, 30 min, full chat.
 * - GROUP: 1 teacher + up to 3 students, 30 min, full chat.
 * - SIBLINGS: 1 teacher + up to 3 sibling profiles under one account.
 * - WEBINAR: 1 teacher + up to 20 students, muted, Q&A last 5 min only.
 */
export const sessionTypeEnum = pgEnum("SessionType", [
  "INDIVIDUAL",
  "GROUP",
  "SIBLINGS",
  "WEBINAR",
]);

/**
 * Session lifecycle states.
 * 📚 STATE MACHINE: SCHEDULED → IN_PROGRESS → COMPLETED | CANCELLED | NO_SHOW
 */
export const sessionStatusEnum = pgEnum("SessionStatus", [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

/** Subscription status mirrors Stripe's subscription statuses. */
export const subscriptionStatusEnum = pgEnum("SubscriptionStatus", [
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "TRIALING",
  "UNPAID",
  "PAUSED",
]);

/**
 * How the student pays.
 * 📚 Manual invoice is the default for Islamic education — families prefer
 * to receive invoices and pay on their schedule.
 */
export const paymentMethodEnum = pgEnum("PaymentMethod", [
  "MANUAL_INVOICE",
  "AUTO_CHARGE",
]);

/** Plan tiers: FREE, INDIVIDUAL ($70), GROUP ($50), SIBLINGS ($100). */
export const planTierEnum = pgEnum("PlanTier", [
  "FREE",
  "INDIVIDUAL",
  "GROUP",
  "SIBLINGS",
]);

/** Booking status tracks whether a scheduled class was attended. */
export const bookingStatusEnum = pgEnum("BookingStatus", [
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

/** Invoice status mirrors Stripe invoice states. */
export const invoiceStatusEnum = pgEnum("InvoiceStatus", [
  "DRAFT",
  "OPEN",
  "PAID",
  "VOID",
  "UNCOLLECTIBLE",
  "OVERDUE",
]);

/** Day of week for default weekly slots. */
export const dayOfWeekEnum = pgEnum("DayOfWeek", [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

/**
 * Who can access a session recording.
 * Teacher decides per session.
 */
export const recordingAccessEnum = pgEnum("RecordingAccess", [
  "NONE",
  "STUDENT_ONLY",
  "STUDENT_AND_OBSERVERS",
  "ALL",
]);

/**
 * CRM sync event types.
 * Tracks what was synced to the external CRM (e.g., HubSpot).
 */
export const crmSyncTypeEnum = pgEnum("CrmSyncType", [
  "CONTACT_CREATED",
  "CONTACT_UPDATED",
  "DEAL_CREATED",
  "DEAL_UPDATED",
  "CANCELLATION_SYNCED",
  "DELINQUENCY_SYNCED",
]);

/** Audit log action categories for security compliance. */
export const auditActionEnum = pgEnum("AuditAction", [
  "USER_LOGIN",
  "USER_LOGOUT",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DELETED",
  "ROLE_CHANGED",
  "IMPERSONATION_START",
  "IMPERSONATION_END",
  "PAYMENT_RECEIVED",
  "REFUND_ISSUED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_CANCELLED",
  "SESSION_CREATED",
  "SESSION_COMPLETED",
  "BOOKING_CREATED",
  "BOOKING_CANCELLED",
  "CHAT_MESSAGE_HIDDEN",
  "CHAT_MESSAGE_DELETED",
  "COUPON_CREATED",
  "EXPORT_GENERATED",
  "SETTINGS_CHANGED",
  "RECORDING_ACCESS_CHANGED",
]);

// ============================================================================
// MODELS
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Organization — a tenant in the multi-tenant system.
 * 📚 Every Quran school gets one org. Data isolation is enforced via `orgId`
 * on every tenant-scoped table.
 */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  domain: text("domain"),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("America/New_York"),
  /** Flexible JSON for org-specific settings (e.g., branding, feature flags). */
  settings: json("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});

// ─────────────────────────────────────────────────────────────────────────────
// USERS & PROFILES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User — core identity. One user per org, may have multiple student profiles.
 * 📚 A parent (User) might have multiple children (StudentProfile).
 * The User is the account owner who pays; StudentProfiles are the learners.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().default("iqra_academy_main").references(() => organizations.id),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name").notNull(),
    image: text("image"),
    phone: text("phone"),
    role: userRoleEnum("role").notNull().default("STUDENT"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    uniqueIndex("users_email_org_idx").on(t.email, t.orgId),
    index("users_org_idx").on(t.orgId),
  ]
);

/**
 * StudentProfile — individual learner (child of a User).
 * 📚 Now includes `orgId` for multi-tenant scoping and `track` for the
 * learning track (Qaidah, Quran Reading, or Hifz).
 *
 * WHY `orgId` HERE? Even though we can derive it from the parent User,
 * having `orgId` directly on the profile enables efficient org-scoped
 * queries without JOINs. This is a deliberate denormalization.
 */
export const studentProfiles = pgTable(
  "student_profiles",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    dateOfBirth: timestamp("date_of_birth"),
    /** Current learning track */
    track: trackEnum("track").notNull().default("QAIDAH"),
    /** Specific level within the track (e.g., "qaida-lesson-5", "juz-1") */
    currentLevel: text("current_level").notNull().default("qaida-basics"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("student_profiles_user_idx").on(t.userId),
    index("student_profiles_org_idx").on(t.orgId),
  ]
);

/**
 * ObserverEmail — weekly digest recipients.
 * 📚 Parents can add observer emails (e.g., spouse, grandparent).
 * By default, observers see all child profiles. The `profileIds` array
 * allows the student (account owner) to restrict which profiles each
 * observer can see. Empty array = all profiles.
 */
export const observerEmails = pgTable(
  "observer_emails",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id),
    email: text("email").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    /** Which student profiles this observer can see. Empty = all. */
    profileIds: json("profile_ids").$type<string[]>().default([]),
    frequency: text("frequency").notNull().default("weekly"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("observer_emails_user_email_idx").on(t.userId, t.email),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// PLANS & SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plan — pricing tier belonging to an org.
 * 📚 PRICING RULES:
 * - FREE: $0, webinar only, no chat.
 * - INDIVIDUAL: $70/mo, 4 classes/week, 1:1.
 * - GROUP: $50/mo, 4 classes/week, group of 3.
 * - SIBLINGS: $100/mo, 4 classes/week PER CHILD, up to 3 children.
 */
export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    tier: planTierEnum("tier").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    priceInCents: integer("price_in_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    /**
     * Classes per week PER CHILD.
     * For SIBLINGS plan: each child gets this many classes.
     * For other plans: the single student gets this many.
     */
    classesPerWeek: integer("classes_per_week").notNull().default(4),
    /** Max student profiles allowed on this plan. Siblings = 3. */
    maxStudents: integer("max_students").notNull().default(1),
    sessionType: sessionTypeEnum("session_type").notNull(),
    stripePriceId: text("stripe_price_id"),
    stripeProductId: text("stripe_product_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [index("plans_org_idx").on(t.orgId)]
);

/**
 * Subscription — links a User to a Plan with Stripe tracking.
 * 📚 WHY TRACK STRIPE IDs LOCALLY?
 * 1. Show subscription status without calling Stripe.
 * 2. Handle webhook events that update status asynchronously.
 * 3. Support the manual invoice flow where payment is delayed.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull().references(() => users.id),
    planId: text("plan_id").notNull().references(() => plans.id),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripeCustomerId: text("stripe_customer_id"),
    status: subscriptionStatusEnum("status").notNull().default("ACTIVE"),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("MANUAL_INVOICE"),
    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("subscriptions_org_idx").on(t.orgId),
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_stripe_idx").on(t.stripeSubscriptionId),
  ]
);

/**
 * Invoice — local mirror of Stripe invoices.
 * 📚 WHY MIRROR INVOICES? We need to:
 * 1. Display invoice history to students without calling Stripe.
 * 2. Support offline/delayed manual invoice payments.
 * 3. Trigger notifications ("Invoice created", "Invoice overdue").
 * 4. Power admin reporting (revenue, overdue, etc.).
 */
export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull().references(() => users.id),
    subscriptionId: text("subscription_id").references(() => subscriptions.id),
    stripeInvoiceId: text("stripe_invoice_id").unique(),
    status: invoiceStatusEnum("status").notNull().default("DRAFT"),
    amountDueCents: integer("amount_due_cents").notNull(),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    /** URL to Stripe's hosted invoice page (for manual payment). */
    hostedInvoiceUrl: text("hosted_invoice_url"),
    invoicePdf: text("invoice_pdf"),
    dueDate: timestamp("due_date"),
    paidAt: timestamp("paid_at"),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("invoices_org_idx").on(t.orgId),
    index("invoices_user_idx").on(t.userId),
    index("invoices_stripe_idx").on(t.stripeInvoiceId),
    index("invoices_status_idx").on(t.status),
  ]
);

/**
 * Entitlement — ledger tracking weekly class quota.
 * 📚 THE LEDGER PATTERN: Instead of a simple counter, we calculate
 * remaining = totalAllowed - COUNT(bookings this week). Self-healing.
 */
export const entitlements = pgTable(
  "entitlements",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
    /** For Siblings plan: per-child entitlements. Null = subscription-level. */
    studentProfileId: text("student_profile_id").references(() => studentProfiles.id),
    weekStartDate: timestamp("week_start_date").notNull(),
    totalClasses: integer("total_classes").notNull(),
    usedClasses: integer("used_classes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("entitlements_sub_week_profile_idx").on(
      t.subscriptionId,
      t.weekStartDate,
      t.studentProfileId
    ),
  ]
);

/**
 * CouponsApplied — tracks which coupon was applied to which subscription.
 * 📚 Separate from CouponRedemption (one-time use tracking) because a
 * coupon can have a duration (e.g., "first 2 months").
 */
export const couponsApplied = pgTable(
  "coupons_applied",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    couponId: text("coupon_id").notNull().references(() => coupons.id),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
    /** How many months this coupon applies. Null = forever. */
    durationMonths: integer("duration_months"),
    /** How many months have been used so far. */
    monthsUsed: integer("months_used").notNull().default(0),
    appliedAt: timestamp("applied_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
  },
  (t) => [
    uniqueIndex("coupons_applied_sub_coupon_idx").on(t.subscriptionId, t.couponId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULING & SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TeacherAvailability — teacher's available time slots.
 * 📚 Synced with Cal.com. Each row = one recurring weekly time slot.
 * Cal.com manages the complex availability logic (conflicts, buffers, etc.),
 * and we store the source of truth locally for display + admin management.
 */
export const teacherAvailability = pgTable(
  "teacher_availability",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    teacherId: text("teacher_id").notNull().references(() => users.id),
    dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
    /** Start time in teacher's timezone (e.g., "09:00"). */
    startTime: time("start_time").notNull(),
    /** End time in teacher's timezone (e.g., "17:00"). */
    endTime: time("end_time").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    /** Whether this slot is currently active. */
    isActive: boolean("is_active").notNull().default(true),
    /** Cal.com schedule ID for syncing. */
    calcomScheduleId: text("calcom_schedule_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("teacher_availability_org_idx").on(t.orgId),
    index("teacher_availability_teacher_idx").on(t.teacherId),
  ]
);

/**
 * DefaultWeeklySlot — each child profile's default weekly lesson time.
 * 📚 BUSINESS RULE: Each child chooses a default weekday + time + teacher
 * per track. They can override the next session's slot only if they
 * change it ≥ 24 hours before class.
 */
export const defaultWeeklySlots = pgTable(
  "default_weekly_slots",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    studentProfileId: text("student_profile_id").notNull().references(() => studentProfiles.id),
    teacherId: text("teacher_id").notNull().references(() => users.id),
    track: trackEnum("track").notNull(),
    dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
    /** Preferred time in student's timezone (e.g., "16:30"). */
    startTime: time("start_time").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    /** One default slot per profile per track. */
    uniqueIndex("default_weekly_slots_profile_track_idx").on(
      t.studentProfileId,
      t.track
    ),
    index("default_weekly_slots_org_idx").on(t.orgId),
    index("default_weekly_slots_teacher_idx").on(t.teacherId),
  ]
);

/**
 * Session — a live teaching session (class).
 * 📚 SESSION LIFECYCLE:
 * 1. SCHEDULED → Created when a booking is confirmed
 * 2. IN_PROGRESS → Teacher starts the call
 * 3. COMPLETED → Session ends (30 min or extended)
 * 4. CANCELLED → Either party cancels
 * 5. NO_SHOW → Student didn't join
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    teacherId: text("teacher_id").notNull().references(() => users.id),
    type: sessionTypeEnum("type").notNull(),
    status: sessionStatusEnum("status").notNull().default("SCHEDULED"),
    title: text("title"),
    track: trackEnum("track"),

    // Scheduling
    scheduledStart: timestamp("scheduled_start").notNull(),
    scheduledEnd: timestamp("scheduled_end").notNull(),
    actualStart: timestamp("actual_start"),
    actualEnd: timestamp("actual_end"),
    isExtended: boolean("is_extended").notNull().default(false),
    extensionMin: integer("extension_min").notNull().default(0),
    /**
     * Whether this session counts against the student's quota.
     * 📚 BUSINESS RULE: Teacher "Call Now" can be ad-hoc (free makeup)
     * or quota-consuming. This flag controls which.
     */
    consumesQuota: boolean("consumes_quota").notNull().default(true),

    // Jitsi integration
    jitsiRoomName: text("jitsi_room_name").unique(),
    jitsiJwt: text("jitsi_jwt"),

    // Recording — teacher decides per session
    recordingUrl: text("recording_url"),
    /** Who can access the recording. Teacher sets this per-session. */
    recordingAccess: recordingAccessEnum("recording_access").notNull().default("NONE"),

    // Cal.com integration
    calcomEventId: text("calcom_event_id"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("sessions_org_idx").on(t.orgId),
    index("sessions_teacher_idx").on(t.teacherId),
    index("sessions_start_idx").on(t.scheduledStart),
  ]
);

/**
 * Booking — student's reserved slot for a session.
 * 📚 BOOKING vs SESSION: A Session is the "class" (teacher + time + room).
 * A Booking is the student's reservation. For GROUP: 1 Session → 3 Bookings.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull().references(() => users.id),
    /** Which child profile is attending. */
    studentProfileId: text("student_profile_id").references(() => studentProfiles.id),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    status: bookingStatusEnum("status").notNull().default("CONFIRMED"),
    calcomBookingId: text("calcom_booking_id"),
    calcomEventId: text("calcom_event_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
    cancelledAt: timestamp("cancelled_at"),
  },
  (t) => [
    index("bookings_org_idx").on(t.orgId),
    index("bookings_user_idx").on(t.userId),
    index("bookings_session_idx").on(t.sessionId),
    index("bookings_profile_idx").on(t.studentProfileId),
  ]
);

/** SessionAttendee — tracks which student profile attended which session. */
export const sessionAttendees = pgTable(
  "session_attendees",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    studentProfileId: text("student_profile_id").notNull().references(() => studentProfiles.id),
    joinedAt: timestamp("joined_at"),
    leftAt: timestamp("left_at"),
    durationMinutes: integer("duration_minutes"),
  },
  (t) => [
    uniqueIndex("session_attendees_unique_idx").on(t.sessionId, t.studentProfileId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// CURRICULUM & PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LessonContent — curriculum lessons organized by track.
 * 📚 Defines what students learn: each track has ordered lessons.
 * Example: QAIDAH track → Lesson 1: Arabic Letters, Lesson 2: Short Vowels...
 */
export const lessonContent = pgTable(
  "lesson_content",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    track: trackEnum("track").notNull(),
    /** Lesson order within the track (1, 2, 3...). */
    sortOrder: integer("sort_order").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    /** Objectives for this lesson (shown to teacher). */
    objectives: json("objectives").$type<string[]>().default([]),
    /** Estimated duration in minutes. */
    estimatedMinutes: integer("estimated_minutes").notNull().default(30),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("lesson_content_org_idx").on(t.orgId),
    uniqueIndex("lesson_content_org_track_order_idx").on(t.orgId, t.track, t.sortOrder),
  ]
);

/**
 * ProgressRecord — lesson completion (requires teacher approval).
 * 📚 THE APPROVAL PATTERN: Students don't self-report progress.
 * The teacher marks a lesson as complete, optionally with notes.
 */
export const progressRecords = pgTable(
  "progress_records",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    studentProfileId: text("student_profile_id").notNull().references(() => studentProfiles.id),
    lessonId: text("lesson_id").notNull().references(() => lessonContent.id),
    sessionId: text("session_id").references(() => sessions.id),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at"),
    teacherApproved: boolean("teacher_approved").notNull().default(false),
    teacherApprovedAt: timestamp("teacher_approved_at"),
    teacherApprovedBy: text("teacher_approved_by").references(() => users.id),
    teacherNotes: text("teacher_notes"),
    /** Optional 1-100 score. */
    score: integer("score"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("progress_records_profile_lesson_idx").on(t.studentProfileId, t.lessonId),
    index("progress_records_profile_idx").on(t.studentProfileId),
  ]
);

/**
 * TeacherFeedback — audio feedback from teacher to student.
 * 📚 WHY AUDIO? Quran learning relies heavily on Tajweed pronunciation.
 * Text can't capture "your 'ain' sound needs more depth."
 */
export const teacherFeedback = pgTable(
  "teacher_feedback",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    teacherId: text("teacher_id").notNull().references(() => users.id),
    studentProfileId: text("student_profile_id").notNull().references(() => studentProfiles.id),
    audioUrl: text("audio_url").notNull(),
    transcription: text("transcription"),
    duration: integer("duration"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("teacher_feedback_session_idx").on(t.sessionId),
    index("teacher_feedback_student_idx").on(t.studentProfileId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ChatRoom — distinct chat spaces.
 * 📚 Types of rooms:
 * - Per-session: created for each live session (GROUP/INDIVIDUAL).
 * - Per-group: persistent room for a recurring group class.
 * - Org-wide: optional community rooms for the whole school.
 *
 * BUSINESS RULE: Free tier has NO chat access.
 */
export const chatRooms = pgTable(
  "chat_rooms",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    /** If linked to a specific session. Null = persistent room. */
    sessionId: text("session_id").references(() => sessions.id),
    /** Whether this is an org-wide community room. */
    isOrgWide: boolean("is_org_wide").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("chat_rooms_org_idx").on(t.orgId),
    index("chat_rooms_session_idx").on(t.sessionId),
  ]
);

/**
 * ChatMessage — messages in chat rooms.
 * 📚 MODERATION: Messages are visible by default. Teachers/admins can
 * hide/delete messages. Hidden messages remain in DB for audit.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    roomId: text("room_id").notNull().references(() => chatRooms.id),
    senderId: text("sender_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_room_idx").on(t.roomId),
    index("chat_messages_org_idx").on(t.orgId),
  ]
);

/**
 * ChatModerationAction — audit trail for chat moderation.
 * 📚 Every hide/delete/unhide action is logged separately from the
 * message itself. This provides a complete moderation history.
 */
export const chatModerationActions = pgTable(
  "chat_moderation_actions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    messageId: text("message_id").notNull().references(() => chatMessages.id),
    moderatorId: text("moderator_id").notNull().references(() => users.id),
    /** "HIDE", "UNHIDE", or "DELETE" */
    action: text("action").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("chat_moderation_message_idx").on(t.messageId),
    index("chat_moderation_org_idx").on(t.orgId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// COUPONS
// ─────────────────────────────────────────────────────────────────────────────

/** Coupon — org-level discount codes synced with Stripe. */
export const coupons = pgTable(
  "coupons",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    code: text("code").notNull(),
    description: text("description"),
    discountPercent: integer("discount_percent"),
    discountAmountCents: integer("discount_amount_cents"),
    maxRedemptions: integer("max_redemptions"),
    currentRedemptions: integer("current_redemptions").notNull().default(0),
    /** Coupon duration: "once", "repeating" (N months), "forever". */
    duration: text("duration").notNull().default("once"),
    /** If duration = "repeating", how many months. */
    durationInMonths: integer("duration_in_months"),
    validFrom: timestamp("valid_from").notNull().defaultNow(),
    validUntil: timestamp("valid_until"),
    isActive: boolean("is_active").notNull().default(true),
    stripeCouponId: text("stripe_coupon_id"),
    applicableTiers: json("applicable_tiers").$type<string[]>().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("coupons_org_code_idx").on(t.orgId, t.code),
    index("coupons_org_idx").on(t.orgId),
  ]
);

/** CouponRedemption — tracks who used which coupon. Prevents double-use. */
export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    couponId: text("coupon_id").notNull().references(() => coupons.id),
    userId: text("user_id").notNull().references(() => users.id),
    redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("coupon_redemptions_unique_idx").on(t.couponId, t.userId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** PushSubscription — Web Push VAPID subscription data. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** "WEB" for VAPID, "EXPO" for Expo Push (mobile). */
    platform: text("platform").notNull().default("WEB"),
    /** Expo Push Token (for mobile). Null for web. */
    expoPushToken: text("expo_push_token"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)]
);

// ─────────────────────────────────────────────────────────────────────────────
// CRM SYNC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CrmSyncEvent — tracks data synced to external CRM (e.g., HubSpot).
 * 📚 WHY TRACK SYNC EVENTS?
 * 1. CRM API calls can fail — we need a retry queue.
 * 2. We need to know what was last synced to avoid duplicates.
 * 3. Debugging: "Why is this student not in HubSpot?"
 */
export const crmSyncEvents = pgTable(
  "crm_sync_events",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").references(() => users.id),
    syncType: crmSyncTypeEnum("sync_type").notNull(),
    /** External CRM ID (e.g., HubSpot contact ID). */
    externalId: text("external_id"),
    /** Payload sent to CRM. */
    payload: json("payload").default({}),
    /** Whether the sync succeeded. */
    success: boolean("success").notNull().default(false),
    /** Error message if sync failed. */
    errorMessage: text("error_message"),
    /** Number of retry attempts. */
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("crm_sync_events_org_idx").on(t.orgId),
    index("crm_sync_events_user_idx").on(t.userId),
    index("crm_sync_events_type_idx").on(t.syncType),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AuditLog — immutable record of every significant action.
 * 📚 Append-only. Never update or delete. Includes actor, target,
 * metadata, and IP address for full traceability.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").references(() => organizations.id),
    actorId: text("actor_id").references(() => users.id),
    action: auditActionEnum("action").notNull(),
    target: text("target"),
    metadata: json("metadata").default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_idx").on(t.orgId),
    index("audit_logs_actor_idx").on(t.actorId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_created_idx").on(t.createdAt),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// BETTER AUTH TABLES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auth Sessions — Better Auth's session management (NOT class sessions!).
 * 📚 These track logged-in users with session tokens and cookies.
 * Separate from `sessions` (which are Quran class sessions).
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("auth_sessions_user_idx").on(t.userId),
    index("auth_sessions_token_idx").on(t.token),
  ]
);

/**
 * Accounts — Better Auth's OAuth account storage.
 * 📚 Stores Google/GitHub/etc. OAuth tokens per user.
 * Also stores hashed passwords for email+password auth.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
  ]
);

/**
 * Verifications — Better Auth's email verification tokens.
 * 📚 Stores verification codes for email confirmation, password reset, etc.
 */
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

// ============================================================================
// RELATIONS
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  plans: many(plans),
  subscriptions: many(subscriptions),
  sessions: many(sessions),
  bookings: many(bookings),
  chatRooms: many(chatRooms),
  chatMessages: many(chatMessages),
  coupons: many(coupons),
  auditLogs: many(auditLogs),
  teacherAvailability: many(teacherAvailability),
  defaultWeeklySlots: many(defaultWeeklySlots),
  lessonContent: many(lessonContent),
  invoices: many(invoices),
  crmSyncEvents: many(crmSyncEvents),
  chatModerationActions: many(chatModerationActions),
  studentProfiles: many(studentProfiles),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  org: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  studentProfiles: many(studentProfiles),
  teacherSessions: many(sessions),
  bookings: many(bookings),
  sentMessages: many(chatMessages),
  feedbackGiven: many(teacherFeedback, { relationName: "feedbackGiven" }),
  subscriptions: many(subscriptions),
  observerEmails: many(observerEmails),
  pushSubscriptions: many(pushSubscriptions),
  auditLogs: many(auditLogs),
  couponRedemptions: many(couponRedemptions),
  teacherAvailability: many(teacherAvailability),
  invoices: many(invoices),
  crmSyncEvents: many(crmSyncEvents),
}));

export const studentProfilesRelations = relations(studentProfiles, ({ one, many }) => ({
  org: one(organizations, { fields: [studentProfiles.orgId], references: [organizations.id] }),
  user: one(users, { fields: [studentProfiles.userId], references: [users.id] }),
  sessionAttendees: many(sessionAttendees),
  progressRecords: many(progressRecords),
  bookings: many(bookings),
  defaultWeeklySlots: many(defaultWeeklySlots),
  entitlements: many(entitlements),
  teacherFeedback: many(teacherFeedback),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  org: one(organizations, { fields: [plans.orgId], references: [organizations.id] }),
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  org: one(organizations, { fields: [subscriptions.orgId], references: [organizations.id] }),
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  entitlements: many(entitlements),
  invoices: many(invoices),
  couponsApplied: many(couponsApplied),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  subscription: one(subscriptions, { fields: [entitlements.subscriptionId], references: [subscriptions.id] }),
  studentProfile: one(studentProfiles, { fields: [entitlements.studentProfileId], references: [studentProfiles.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  org: one(organizations, { fields: [invoices.orgId], references: [organizations.id] }),
  user: one(users, { fields: [invoices.userId], references: [users.id] }),
  subscription: one(subscriptions, { fields: [invoices.subscriptionId], references: [subscriptions.id] }),
}));

export const couponsAppliedRelations = relations(couponsApplied, ({ one }) => ({
  coupon: one(coupons, { fields: [couponsApplied.couponId], references: [coupons.id] }),
  subscription: one(subscriptions, { fields: [couponsApplied.subscriptionId], references: [subscriptions.id] }),
}));

export const teacherAvailabilityRelations = relations(teacherAvailability, ({ one }) => ({
  org: one(organizations, { fields: [teacherAvailability.orgId], references: [organizations.id] }),
  teacher: one(users, { fields: [teacherAvailability.teacherId], references: [users.id] }),
}));

export const defaultWeeklySlotsRelations = relations(defaultWeeklySlots, ({ one }) => ({
  org: one(organizations, { fields: [defaultWeeklySlots.orgId], references: [organizations.id] }),
  studentProfile: one(studentProfiles, { fields: [defaultWeeklySlots.studentProfileId], references: [studentProfiles.id] }),
  teacher: one(users, { fields: [defaultWeeklySlots.teacherId], references: [users.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  org: one(organizations, { fields: [bookings.orgId], references: [organizations.id] }),
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  studentProfile: one(studentProfiles, { fields: [bookings.studentProfileId], references: [studentProfiles.id] }),
  session: one(sessions, { fields: [bookings.sessionId], references: [sessions.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  org: one(organizations, { fields: [sessions.orgId], references: [organizations.id] }),
  teacher: one(users, { fields: [sessions.teacherId], references: [users.id] }),
  bookings: many(bookings),
  attendees: many(sessionAttendees),
  chatRoom: many(chatRooms),
  feedback: many(teacherFeedback),
  progressRecords: many(progressRecords),
}));

export const sessionAttendeesRelations = relations(sessionAttendees, ({ one }) => ({
  session: one(sessions, { fields: [sessionAttendees.sessionId], references: [sessions.id] }),
  studentProfile: one(studentProfiles, { fields: [sessionAttendees.studentProfileId], references: [studentProfiles.id] }),
}));

export const lessonContentRelations = relations(lessonContent, ({ one, many }) => ({
  org: one(organizations, { fields: [lessonContent.orgId], references: [organizations.id] }),
  progressRecords: many(progressRecords),
}));

export const progressRecordsRelations = relations(progressRecords, ({ one }) => ({
  studentProfile: one(studentProfiles, { fields: [progressRecords.studentProfileId], references: [studentProfiles.id] }),
  lesson: one(lessonContent, { fields: [progressRecords.lessonId], references: [lessonContent.id] }),
  session: one(sessions, { fields: [progressRecords.sessionId], references: [sessions.id] }),
  approvedBy: one(users, { fields: [progressRecords.teacherApprovedBy], references: [users.id] }),
}));

export const teacherFeedbackRelations = relations(teacherFeedback, ({ one }) => ({
  session: one(sessions, { fields: [teacherFeedback.sessionId], references: [sessions.id] }),
  teacher: one(users, { fields: [teacherFeedback.teacherId], references: [users.id] }),
  studentProfile: one(studentProfiles, { fields: [teacherFeedback.studentProfileId], references: [studentProfiles.id] }),
}));

export const chatRoomsRelations = relations(chatRooms, ({ one, many }) => ({
  org: one(organizations, { fields: [chatRooms.orgId], references: [organizations.id] }),
  session: one(sessions, { fields: [chatRooms.sessionId], references: [sessions.id] }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  org: one(organizations, { fields: [chatMessages.orgId], references: [organizations.id] }),
  room: one(chatRooms, { fields: [chatMessages.roomId], references: [chatRooms.id] }),
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
  moderationActions: many(chatModerationActions),
}));

export const chatModerationActionsRelations = relations(chatModerationActions, ({ one }) => ({
  org: one(organizations, { fields: [chatModerationActions.orgId], references: [organizations.id] }),
  message: one(chatMessages, { fields: [chatModerationActions.messageId], references: [chatMessages.id] }),
  moderator: one(users, { fields: [chatModerationActions.moderatorId], references: [users.id] }),
}));

export const observerEmailsRelations = relations(observerEmails, ({ one }) => ({
  user: one(users, { fields: [observerEmails.userId], references: [users.id] }),
}));

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  org: one(organizations, { fields: [coupons.orgId], references: [organizations.id] }),
  redemptions: many(couponRedemptions),
  applied: many(couponsApplied),
}));

export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
  coupon: one(coupons, { fields: [couponRedemptions.couponId], references: [coupons.id] }),
  user: one(users, { fields: [couponRedemptions.userId], references: [users.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));

export const crmSyncEventsRelations = relations(crmSyncEvents, ({ one }) => ({
  org: one(organizations, { fields: [crmSyncEvents.orgId], references: [organizations.id] }),
  user: one(users, { fields: [crmSyncEvents.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  org: one(organizations, { fields: [auditLogs.orgId], references: [organizations.id] }),
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));
