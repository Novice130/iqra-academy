/**
 * @fileoverview /admin/users — who is in the school, and what they are.
 *
 * This is the page that turns a signed-up person into a teacher. The API to
 * do it (PATCH /api/admin/users) has existed for a long time and nothing ever
 * called it, so in practice roles could only be changed by hand-written SQL.
 *
 * Server component for the auth gate and the first paint; the table itself is
 * a client component because changing a role is a mutation.
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
      <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
        <header
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
            padding: "24px 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#fff" }}>
              People
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#a7f3d0" }}>
              Promote a student to teacher, or correct a role
            </p>
          </div>
          <Link href="/admin" style={{ color: "#a7f3d0", textDecoration: "none", fontSize: "14px" }}>
            ← Admin
          </Link>
        </header>

        <main style={{ padding: "24px 32px" }}>
          <UserRoleTable initialUsers={initial} currentUserId={session.user.id} currentRole={role} />
        </main>
      </div>
    );
  });
}
