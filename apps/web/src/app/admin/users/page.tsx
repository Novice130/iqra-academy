/**
 * @fileoverview /admin/users — every account, its role, and adding or
 * removing one.
 *
 * `?new=teacher` (or student, admin) opens the add form preset to that role;
 * the Teachers page links here that way. Writes go through /api/admin/users,
 * which holds the root-admin, self and privilege-ceiling guards.
 */

import { and, desc, isNull } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import type { UserRole } from "@/lib/roles";
import { PageHeader, StatCard, StatGrid } from "../_components/ui";
import UserRoleTable, { type AdminUserRow } from "./UserRoleTable";

export const dynamic = "force-dynamic";

const PRESETS: Record<string, UserRole> = { teacher: "TEACHER", student: "STUDENT", admin: "ORG_ADMIN" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/users");
    const { new: preset } = await searchParams;

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
      .where(and(orgFilter(admin, users.orgId), isNull(users.deletedAt)))
      .orderBy(desc(users.createdAt));

    const initial: AdminUserRow[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    const count = (pred: (r: AdminUserRow) => boolean) => initial.filter(pred).length;
    const presetRole = preset && Object.hasOwn(PRESETS, preset) ? PRESETS[preset] : undefined;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Users & roles"
          description="Add people, promote students to teachers, grant admin access, or remove an account."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Users & roles" }]}
        />

        <StatGrid>
          <StatCard label="Accounts" value={initial.length} />
          <StatCard label="Teachers" value={count((r) => r.role === "TEACHER")} href="/admin/teachers" />
          <StatCard label="Students" value={count((r) => r.role === "STUDENT")} />
          <StatCard label="Admins" value={count((r) => r.role === "ORG_ADMIN" || r.role === "SUPER_ADMIN")} />
        </StatGrid>

        <UserRoleTable
          initialUsers={initial}
          currentUserId={admin.userId}
          currentRole={admin.role}
          openNew={Boolean(presetRole)}
          newRole={presetRole ?? "TEACHER"}
        />
      </div>
    );
  });
}
