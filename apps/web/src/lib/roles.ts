/**
 * @fileoverview User roles, their order and their display names.
 *
 * Client-safe on purpose: lib/rbac.ts imports the auth and database modules,
 * so a client component that only wanted to compare two roles could not
 * import from it, and UserRoleTable kept its own copy of the ranking that had
 * already drifted (it started at 1, the server at 0). This is the one copy;
 * rbac.ts re-exports it under the same names.
 *
 * @module lib/roles
 */

/** Matches the UserRole pgEnum in db/schema.ts. */
export type UserRole = "STUDENT" | "TEACHER" | "ORG_ADMIN" | "SUPER_ADMIN";

/**
 * Higher includes everything below it: STUDENT < TEACHER < ORG_ADMIN < SUPER_ADMIN.
 * `requireRole` admits anyone at or above the lowest role it is given.
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  STUDENT: 0,
  TEACHER: 1,
  ORG_ADMIN: 2,
  SUPER_ADMIN: 3,
};

/** Every role, lowest first. */
export const ROLES: UserRole[] = ["STUDENT", "TEACHER", "ORG_ADMIN", "SUPER_ADMIN"];

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  ORG_ADMIN: "Administrator",
  SUPER_ADMIN: "Super admin",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && value in ROLE_HIERARCHY;
}

/** Roles that may teach a class: teachers, and admins who also teach. */
export const TEACHING_ROLES: UserRole[] = ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"];
