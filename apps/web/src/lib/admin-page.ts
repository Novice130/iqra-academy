/**
 * @fileoverview Auth gate for /admin server components.
 *
 * Every admin page used to repeat the same fifteen lines — read the session,
 * load the user row, check the role, redirect — on top of the identical check
 * in admin/layout.tsx, so each request looked the user up twice. This is that
 * check once, memoised per request with React's `cache`, so the layout and the
 * page share one lookup.
 *
 * SCOPE RULE for admin reads: an ORG_ADMIN sees their own org; a SUPER_ADMIN
 * sees every org. Use `orgFilter` so pages apply that the same way. Writes go
 * through the API routes, which enforce their own scoping.
 *
 * @module lib/admin-page
 */

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { canAccessAdmin, type UserRole } from "@/lib/rbac";

export interface AdminContext {
  userId: string;
  orgId: string;
  role: UserRole;
  isSuperAdmin: boolean;
  name: string | null;
  email: string;
  timezone: string | null;
}

const loadAdmin = cache(async (): Promise<AdminContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const row = await db.query.users.findFirst({
    where: and(eq(users.id, session.user.id), isNull(users.deletedAt)),
    columns: { id: true, orgId: true, role: true, name: true, email: true, timezone: true },
  });
  if (!row) return null;
  return {
    userId: row.id,
    orgId: row.orgId,
    role: row.role as UserRole,
    isSuperAdmin: row.role === "SUPER_ADMIN",
    name: row.name ?? null,
    email: row.email,
    timezone: row.timezone ?? null,
  };
});

/**
 * Returns the signed-in admin, or redirects: to /login when signed out, to
 * /dashboard when signed in without an admin role.
 *
 * @param path - where to come back to after login, e.g. "/admin/students"
 */
export async function requireAdminPage(path = "/admin"): Promise<AdminContext> {
  const ctx = await loadAdmin();
  if (!ctx) redirect(`/login?redirect=${encodeURIComponent(path)}`);
  if (!canAccessAdmin(ctx.role)) redirect("/dashboard?error=unauthorized");
  return ctx;
}

/**
 * The org condition for an admin read: `column = orgId` for an ORG_ADMIN,
 * nothing for a SUPER_ADMIN. Pass the table's org column.
 */
export function orgFilter(ctx: AdminContext, column: PgColumn): SQL | undefined {
  return ctx.isSuperAdmin ? undefined : eq(column, ctx.orgId);
}
