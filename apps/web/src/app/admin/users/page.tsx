/**
 * @fileoverview /admin/users — People, roles, and teacher promotion.
 *
 * Server component for the auth gate and first paint.
 * Uses Tailwind CSS layout integrated with AdminLayout.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { users } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import UserRoleTable, { type AdminUserRow } from "./UserRoleTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) redirect("/login?redirect=/admin/users");

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, orgId: true },
    });

    const role = dbUser?.role || "STUDENT";
    if (!canAccessAdmin(role)) redirect("/dashboard?error=unauthorized");

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        phone: users.phone,
        timezone: users.timezone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.orgId, dbUser!.orgId), isNull(users.deletedAt)))
      .orderBy(desc(users.createdAt));

    const initial: AdminUserRow[] = rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      phone: r.phone,
      timezone: r.timezone,
      createdAt: r.createdAt.toISOString(),
    }));

    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] mb-1">
              <Link href="/admin" className="hover:text-[var(--accent)] transition">
                Admin
              </Link>
              <span>/</span>
              <span>People & Roles</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              People & Permissions
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Promote signed-up students to teachers, assign administrator privileges, or correct roles.
            </p>
          </div>

          <Link
            href="/admin"
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition self-start sm:self-auto"
          >
            ← Back to Overview
          </Link>
        </div>

        {/* Interactive User Table */}
        <div className="p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm">
          <UserRoleTable initialUsers={initial} currentUserId={session.user.id} currentRole={role} />
        </div>
      </div>
    );
  });
}
