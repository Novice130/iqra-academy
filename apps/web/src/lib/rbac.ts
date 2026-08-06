/**
 * @fileoverview RBAC (Role-Based Access Control) Middleware
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * RBAC is the security pattern where each user has a "role" and each API
 * endpoint requires certain roles. Think of it like a building:
 * - Students can enter the classroom (student endpoints)
 * - Teachers can enter the classroom + teacher lounge (teacher endpoints)
 * - Admins can enter everywhere + the server room (admin endpoints)
 *
 * THE #1 RULE: Authorization checks happen ON THE SERVER, never the client.
 * A malicious user can modify client-side code, but they can't modify our server.
 *
 * HOW THIS WORKS:
 * 1. Every API route calls `requireAuth()` to verify the session
 * 2. Then calls `requireRole()` to check if the user's role is sufficient
 * 3. If either check fails, we return 401/403 immediately — the route handler
 *    never executes. This is the "fail-fast" pattern.
 *
 * @module lib/rbac
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";
import { db } from "./db";
import { eq, and, isNull } from "drizzle-orm";
import { users } from "@/db/schema";

/**
 * User role type — matches the pgEnum in schema.
 */
export type UserRole = "STUDENT" | "TEACHER" | "ORG_ADMIN" | "SUPER_ADMIN";

/**
 * Represents an authenticated user context passed to route handlers.
 * This is the "trust boundary" — once you have an AuthContext, you know
 * the user is authenticated and their role is verified.
 */
export interface AuthContext {
  /** The authenticated user's database ID */
  userId: string;
  /** The user's organization ID (for multi-tenant scoping) */
  orgId: string;
  /** The user's role (determines what they can access) */
  role: UserRole;
  /** The user's email (for audit logging) */
  email: string;
  /** Whether this session is an impersonation session */
  isImpersonating: boolean;
  /** If impersonating, the original admin's user ID */
  originalUserId?: string;
}

/**
 * Role hierarchy — higher-privilege roles include all lower-privilege access.
 *
 * 📚 WHY A HIERARCHY?
 * An ORG_ADMIN should be able to do everything a TEACHER can do, plus more.
 * Instead of listing every role for every endpoint, we define a hierarchy:
 *   STUDENT < TEACHER < ORG_ADMIN < SUPER_ADMIN
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  STUDENT: 0,
  TEACHER: 1,
  ORG_ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Extracts and validates the user's session from the request.
 * Returns null if the user is not authenticated.
 *
 * 📚 HOW SESSION VALIDATION WORKS:
 * 1. Better Auth reads the session cookie from the request headers
 * 2. It looks up the session in our database (DB-backed sessions!)
 * 3. If the session exists and hasn't expired, we get the user data
 * 4. We then query our User table for role and org info
 *
 * @param request - The incoming Next.js request
 * @returns AuthContext if authenticated, null otherwise
 */
export async function getAuthContext(
  request: NextRequest
): Promise<AuthContext | null> {
  try {
    // Step 1: Get session from Better Auth
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return null;
    }

    // Step 2: Get full user data with role and org from our database
    const user = await db.query.users.findFirst({
      where: and(
        eq(users.email, session.user.email),
        isNull(users.deletedAt)
      ),
      columns: {
        id: true,
        orgId: true,
        role: true,
        email: true,
      },
    });

    if (!user) {
      return null;
    }

    // Step 3: Check for impersonation session
    const isImpersonating = false; // TODO: implement impersonation tracking
    const originalUserId = undefined;

    return {
      userId: user.id,
      orgId: user.orgId,
      role: user.role as UserRole,
      email: user.email,
      isImpersonating,
      originalUserId,
    };
  } catch (error) {
    console.error("[RBAC] Failed to get auth context:", error);
    return null;
  }
}

/**
 * Middleware that requires authentication. Returns the AuthContext if
 * the user is authenticated, or a 401 Response if not.
 *
 * USAGE:
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const authResult = await requireAuth(request);
 *   if (authResult instanceof NextResponse) return authResult; // 401
 *   const { userId, orgId, role } = authResult;
 *   // ... handle request
 * }
 * ```
 *
 * @param request - The incoming request
 * @returns AuthContext on success, NextResponse (401) on failure
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthContext | NextResponse> {
  const context = await getAuthContext(request);

  if (!context) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "You must be logged in to access this resource.",
      },
      { status: 401 }
    );
  }

  return context;
}

/**
 * Middleware that requires a specific role (or higher in the hierarchy).
 *
 * 📚 HOW ROLE CHECKING WORKS:
 * We compare the user's role level to the minimum required level.
 * If the user's level >= required level, access is granted.
 *
 * @param request - The incoming request
 * @param allowedRoles - Array of roles that can access this endpoint
 * @returns AuthContext on success, NextResponse (401/403) on failure
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole[]
): Promise<AuthContext | NextResponse> {
  const authResult = await requireAuth(request);

  // If requireAuth returned a Response (401), pass it through
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const context = authResult;
  const userLevel = ROLE_HIERARCHY[context.role];
  const minRequiredLevel = Math.min(
    ...allowedRoles.map((role) => ROLE_HIERARCHY[role])
  );

  if (userLevel < minRequiredLevel) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: `This action requires one of these roles: ${allowedRoles.join(", ")}. Your role: ${context.role}`,
      },
      { status: 403 }
    );
  }

  return context;
}

/**
 * Helper to enforce org-scoped data access. Always use this when querying
 * tenant-specific data to prevent data leaks between organizations.
 *
 * 📚 WHY IS THIS A FUNCTION AND NOT JUST `where: { orgId }`?
 * 1. Consistency — every developer uses the same pattern
 * 2. Auditability — we can grep for `orgScope` to verify all queries are scoped
 * 3. Future-proofing — if we add RLS at the DB level, this is the toggle point
 */
export function orgScope(orgId: string) {
  return { orgId } as const;
}

/**
 * Checks if the user is a Super Admin (can access all orgs).
 *
 * 📚 SUPER ADMIN BYPASS: Super admins manage the entire platform.
 * They don't belong to a single org — they can access any org's data.
 */
export function isSuperAdmin(context: AuthContext): boolean {
  return context.role === "SUPER_ADMIN";
}
