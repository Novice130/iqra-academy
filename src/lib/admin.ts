/**
 * @fileoverview AdminJS Configuration
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * AdminJS is an open-source admin panel that auto-generates CRUD (Create, Read,
 * Update, Delete) interfaces for your database tables. Instead of building 25
 * admin pages from scratch, AdminJS reads your Drizzle schema and creates them
 * for you.
 *
 * WHAT THIS FILE DOES:
 * - Defines which tables appear in the admin panel
 * - Groups them into navigation sections (Users, Billing, Sessions, etc.)
 * - Restricts access to ORG_ADMIN and SUPER_ADMIN roles
 * - Adds custom actions (impersonate user, issue refund, etc.)
 *
 * ACCESS: Only accessible at /admin by authenticated admins.
 *
 * @module lib/admin
 */

/**
 * AdminJS Resource Configuration
 *
 * 📚 Each resource represents one database table in the admin panel.
 * We group them into navigation sections for easy browsing.
 *
 * NAVIGATION GROUPS:
 * 1. Users & Profiles — manage accounts, student profiles, observers
 * 2. Billing — plans, subscriptions, invoices, coupons
 * 3. Scheduling — sessions, bookings, teacher availability
 * 4. Content — lesson content, progress records, feedback
 * 5. Communication — chat rooms, messages, moderation
 * 6. System — audit logs, CRM sync, push subscriptions
 */
export const adminResources = {
  usersAndProfiles: {
    navigation: "Users & Profiles",
    tables: [
      "organizations",
      "users",
      "student_profiles",
      "observer_emails",
    ],
  },
  billing: {
    navigation: "Billing",
    tables: [
      "plans",
      "subscriptions",
      "invoices",
      "entitlements",
      "coupons",
      "coupon_redemptions",
      "coupons_applied",
    ],
  },
  scheduling: {
    navigation: "Scheduling",
    tables: [
      "sessions",
      "bookings",
      "session_attendees",
      "teacher_availability",
      "default_weekly_slots",
    ],
  },
  content: {
    navigation: "Content & Progress",
    tables: [
      "lesson_content",
      "progress_records",
      "teacher_feedback",
    ],
  },
  communication: {
    navigation: "Communication",
    tables: [
      "chat_rooms",
      "chat_messages",
      "chat_moderation_actions",
      "push_subscriptions",
    ],
  },
  system: {
    navigation: "System",
    tables: [
      "audit_logs",
      "crm_sync_events",
    ],
  },
};

/**
 * Admin panel branding configuration.
 */
export const adminBranding = {
  companyName: "Iqra Academy Admin",
  logo: false as const, // Use text instead of logo image
  softwareBrothers: false, // Hide AdminJS branding
  theme: {
    colors: {
      primary100: "#10b981", // Emerald — matches the LMS brand
      primary80: "#059669",
      primary60: "#047857",
      primary40: "#065f46",
      primary20: "#064e3b",
      accent: "#f59e0b", // Amber accent
      hoverBg: "#ecfdf5",
    },
  },
};

/**
 * Checks if a user has admin access.
 * Only ORG_ADMIN and SUPER_ADMIN can access the admin panel.
 *
 * @param role - User's role from auth context
 * @returns true if the user can access the admin panel
 */
export function canAccessAdmin(role: string): boolean {
  return role === "ORG_ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Admin panel metadata — used by the /admin page to display info.
 */
export const adminMeta = {
  title: "Iqra Academy — Admin Panel",
  description: "Manage your Quran learning platform",
  version: "1.0.0",
  totalTables: 25,
  navigationGroups: Object.keys(adminResources).length,
};
