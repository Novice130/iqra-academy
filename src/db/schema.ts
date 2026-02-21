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
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// ============================================================================
// ENUMS
// ============================================================================

export const userRoleEnum = pgEnum("UserRole", [
  "STUDENT",
  "TEACHER",
  "ORG_ADMIN",
  "SUPER_ADMIN",
]);

export const sessionTypeEnum = pgEnum("SessionType", [
  "INDIVIDUAL",
  "GROUP",
  "WEBINAR",
]);

export const sessionStatusEnum = pgEnum("SessionStatus", [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const subscriptionStatusEnum = pgEnum("SubscriptionStatus", [
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "TRIALING",
  "UNPAID",
  "PAUSED",
]);

export const paymentMethodEnum = pgEnum("PaymentMethod", [
  "MANUAL_INVOICE",
  "AUTO_CHARGE",
]);

export const planTierEnum = pgEnum("PlanTier", [
  "FREE",
  "INDIVIDUAL",
  "GROUP",
  "SIBLINGS",
]);

export const bookingStatusEnum = pgEnum("BookingStatus", [
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

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
  "COUPON_CREATED",
  "EXPORT_GENERATED",
  "SETTINGS_CHANGED",
]);

// ============================================================================
// MODELS
// ============================================================================

/** Organization — a tenant in the multi-tenant system. */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  domain: text("domain"),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("America/New_York"),
  settings: json("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});

/** User — core identity. One user per org, may have multiple student profiles. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
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

/** StudentProfile — individual learner (child of a User). */
export const studentProfiles = pgTable(
  "student_profiles",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    dateOfBirth: timestamp("date_of_birth"),
    currentLevel: text("current_level").notNull().default("qaida-basics"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [index("student_profiles_user_idx").on(t.userId)]
);

/** Plan — pricing tier belonging to an org. */
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
    classesPerWeek: integer("classes_per_week").notNull().default(4),
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

/** Subscription — links a User to a Plan with Stripe tracking. */
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

/** Entitlement — ledger tracking weekly class quota. */
export const entitlements = pgTable(
  "entitlements",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
    weekStartDate: timestamp("week_start_date").notNull(),
    totalClasses: integer("total_classes").notNull(),
    usedClasses: integer("used_classes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("entitlements_sub_week_idx").on(t.subscriptionId, t.weekStartDate),
  ]
);

/** Booking — student's reserved slot for a session. */
export const bookings = pgTable(
  "bookings",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull().references(() => users.id),
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
  ]
);

/** Session — a live teaching session (class). */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    teacherId: text("teacher_id").notNull().references(() => users.id),
    type: sessionTypeEnum("type").notNull(),
    status: sessionStatusEnum("status").notNull().default("SCHEDULED"),
    title: text("title"),
    scheduledStart: timestamp("scheduled_start").notNull(),
    scheduledEnd: timestamp("scheduled_end").notNull(),
    actualStart: timestamp("actual_start"),
    actualEnd: timestamp("actual_end"),
    isExtended: boolean("is_extended").notNull().default(false),
    extensionMin: integer("extension_min").notNull().default(0),
    jitsiRoomName: text("jitsi_room_name").unique(),
    jitsiJwt: text("jitsi_jwt"),
    recordingUrl: text("recording_url"),
    recordingAccessible: boolean("recording_accessible").notNull().default(false),
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

/** ProgressRecord — lesson completion (requires teacher approval). */
export const progressRecords = pgTable(
  "progress_records",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    studentProfileId: text("student_profile_id").notNull().references(() => studentProfiles.id),
    lessonId: text("lesson_id").notNull(),
    lessonTitle: text("lesson_title").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at"),
    teacherApproved: boolean("teacher_approved").notNull().default(false),
    teacherNotes: text("teacher_notes"),
    score: integer("score"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("progress_records_profile_lesson_idx").on(t.studentProfileId, t.lessonId),
    index("progress_records_profile_idx").on(t.studentProfileId),
  ]
);

/** ChatMessage — moderated in-session chat. */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    senderId: text("sender_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    hiddenBy: text("hidden_by"),
    hiddenAt: timestamp("hidden_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_session_idx").on(t.sessionId),
    index("chat_messages_org_idx").on(t.orgId),
  ]
);

/** TeacherFeedback — audio feedback from teacher to student. */
export const teacherFeedback = pgTable(
  "teacher_feedback",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    teacherId: text("teacher_id").notNull().references(() => users.id),
    studentId: text("student_id").notNull().references(() => users.id),
    audioUrl: text("audio_url").notNull(),
    transcription: text("transcription"),
    duration: integer("duration"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("teacher_feedback_session_idx").on(t.sessionId),
    index("teacher_feedback_student_idx").on(t.studentId),
  ]
);

/** ObserverEmail — weekly digest recipients. */
export const observerEmails = pgTable(
  "observer_emails",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id),
    email: text("email").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    profileIds: json("profile_ids").$type<string[]>().default([]),
    frequency: text("frequency").notNull().default("weekly"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("observer_emails_user_email_idx").on(t.userId, t.email),
  ]
);

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

/** CouponRedemption — tracks who used which coupon. */
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

/** PushSubscription — Web Push VAPID subscription data. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)]
);

/** AuditLog — immutable record of every significant action. */
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

// ============================================================================
// RELATIONS
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  plans: many(plans),
  subscriptions: many(subscriptions),
  sessions: many(sessions),
  bookings: many(bookings),
  chatMessages: many(chatMessages),
  coupons: many(coupons),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  org: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  studentProfiles: many(studentProfiles),
  teacherSessions: many(sessions),
  bookings: many(bookings),
  sentMessages: many(chatMessages),
  feedbackGiven: many(teacherFeedback, { relationName: "feedbackGiven" }),
  feedbackReceived: many(teacherFeedback, { relationName: "feedbackReceived" }),
  subscriptions: many(subscriptions),
  observerEmails: many(observerEmails),
  pushSubscriptions: many(pushSubscriptions),
  auditLogs: many(auditLogs),
  couponRedemptions: many(couponRedemptions),
}));

export const studentProfilesRelations = relations(studentProfiles, ({ one, many }) => ({
  user: one(users, { fields: [studentProfiles.userId], references: [users.id] }),
  sessionAttendees: many(sessionAttendees),
  progressRecords: many(progressRecords),
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
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  subscription: one(subscriptions, { fields: [entitlements.subscriptionId], references: [subscriptions.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  org: one(organizations, { fields: [bookings.orgId], references: [organizations.id] }),
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  session: one(sessions, { fields: [bookings.sessionId], references: [sessions.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  org: one(organizations, { fields: [sessions.orgId], references: [organizations.id] }),
  teacher: one(users, { fields: [sessions.teacherId], references: [users.id] }),
  bookings: many(bookings),
  attendees: many(sessionAttendees),
  messages: many(chatMessages),
  feedback: many(teacherFeedback),
}));

export const sessionAttendeesRelations = relations(sessionAttendees, ({ one }) => ({
  session: one(sessions, { fields: [sessionAttendees.sessionId], references: [sessions.id] }),
  studentProfile: one(studentProfiles, { fields: [sessionAttendees.studentProfileId], references: [studentProfiles.id] }),
}));

export const progressRecordsRelations = relations(progressRecords, ({ one }) => ({
  studentProfile: one(studentProfiles, { fields: [progressRecords.studentProfileId], references: [studentProfiles.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  org: one(organizations, { fields: [chatMessages.orgId], references: [organizations.id] }),
  session: one(sessions, { fields: [chatMessages.sessionId], references: [sessions.id] }),
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
}));

export const teacherFeedbackRelations = relations(teacherFeedback, ({ one }) => ({
  session: one(sessions, { fields: [teacherFeedback.sessionId], references: [sessions.id] }),
  teacher: one(users, { fields: [teacherFeedback.teacherId], references: [users.id], relationName: "feedbackGiven" }),
  student: one(users, { fields: [teacherFeedback.studentId], references: [users.id], relationName: "feedbackReceived" }),
}));

export const observerEmailsRelations = relations(observerEmails, ({ one }) => ({
  user: one(users, { fields: [observerEmails.userId], references: [users.id] }),
}));

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  org: one(organizations, { fields: [coupons.orgId], references: [organizations.id] }),
  redemptions: many(couponRedemptions),
}));

export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
  coupon: one(coupons, { fields: [couponRedemptions.couponId], references: [coupons.id] }),
  user: one(users, { fields: [couponRedemptions.userId], references: [users.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  org: one(organizations, { fields: [auditLogs.orgId], references: [organizations.id] }),
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));
