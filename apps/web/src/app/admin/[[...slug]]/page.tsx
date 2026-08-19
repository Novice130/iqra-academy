/**
 * @fileoverview Admin Panel Page
 *
 * 📚 This page renders a server-side admin dashboard at /admin.
 * It uses our existing RBAC to restrict access and provides
 * a table-based CRUD interface for all 25 database tables.
 *
 * ROUTE: /admin (catch-all with [[...slug]])
 * ACCESS: ORG_ADMIN + SUPER_ADMIN only
 *
 * WHY SERVER COMPONENT?
 * The admin panel reads directly from the database on the server.
 * No client-side JavaScript bundle needed — fast and secure.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccessAdmin, adminResources, adminMeta } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { users, sessions } from "@/db/schema";
import { sql, eq, inArray } from "drizzle-orm";
import { getRoomServiceClient } from "@/lib/livekit";


/**
 * Which table names have a real page behind them.
 *
 * Everything in `adminResources` used to render as a link to
 * `/admin/tables/<name>`, and not one of those routes was ever built — the
 * whole panel was a wall of dead links. A card with no destination now renders
 * as plain text saying so, which is worse-looking and considerably more
 * honest. Add an entry here as each page gets built.
 */
const TABLE_PAGES: Record<string, string> = {
  users: "/admin/users",
  invoices: "/admin/invoices",
};

/**
 * Server-side admin panel page.
 * Verifies auth and role before rendering.
 */
export default async function AdminPage() {
  return withDb(async () => {
  // Verify authentication
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) {
    redirect("/login?redirect=/admin");
  }

  // Verify admin role
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { role: true },
  });

  const role = dbUser?.role || "STUDENT";
  if (!canAccessAdmin(role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const user = { ...session.user, role };

  // Fetch table counts for the dashboard
  const tableCounts = await getTableCounts();
  const liveClasses = await getLiveClasses();

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
      {/* Header */}
      <header style={{
        background: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
        padding: "24px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#fff" }}>
            🕌 {adminMeta.title}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#a7f3d0" }}>
            {adminMeta.description} • {adminMeta.totalTables} tables • v{adminMeta.version}
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{
            background: "#065f46",
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "13px",
            color: "#a7f3d0",
          }}>
            {user.role}
          </span>
          <a href="/dashboard" style={{
            color: "#a7f3d0",
            textDecoration: "none",
            fontSize: "14px",
          }}>
            ← Back to App
          </a>
        </div>
      </header>

      {/* Dashboard */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px" }}>
        {/* Stats Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}>
          {tableCounts.map((stat) => (
            <div key={stat.label} style={{
              background: "#1e293b",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #334155",
            }}>
              <div style={{ fontSize: "32px", fontWeight: 700, color: "#10b981" }}>
                {stat.count}
              </div>
              <div style={{ fontSize: "14px", color: "#94a3b8", marginTop: "4px" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Live Classes — reads directly from LiveKit, not the DB session
            status column, so a session stuck at SCHEDULED/COMPLETED in the
            DB but still actually connected on LiveKit still shows up here. */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#ef4444",
            borderBottom: "1px solid #334155",
            paddingBottom: "8px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            🔴 Live Now ({liveClasses.length})
          </h2>
          {liveClasses.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: "14px" }}>No classes currently live.</div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {liveClasses.map((room) => (
                <div key={room.name} style={{
                  background: "#1e293b",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1px solid #334155",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>
                      {room.session ? (room.session.title || room.session.track || "Quran Class") : room.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      {room.session ? `Teacher: ${room.session.teacherName}` : "No matching session record"}
                      {room.creationTime && ` • started ${new Date(room.creationTime).toLocaleTimeString()}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "13px", color: "#a7f3d0" }}>
                      {room.numParticipants} participant{room.numParticipants === 1 ? "" : "s"}
                    </span>
                    {room.session && (
                      <a href={`/dashboard/session/${room.session.id}`} style={{ fontSize: "12px", color: "#10b981", textDecoration: "none" }}>
                        View →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Table Navigation */}
        {Object.entries(adminResources).map(([key, group]) => (
          <section key={key} style={{ marginBottom: "32px" }}>
            <h2 style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#10b981",
              borderBottom: "1px solid #334155",
              paddingBottom: "8px",
              marginBottom: "16px",
            }}>
              {group.navigation}
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "12px",
            }}>
              {group.tables.map((table) => {
                const href = TABLE_PAGES[table];
                const label = table.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                const boxStyle: React.CSSProperties = {
                  background: "#1e293b",
                  borderRadius: "8px",
                  padding: "16px",
                  border: href ? "1px solid #10b981" : "1px solid #334155",
                  textDecoration: "none",
                  color: href ? "#e2e8f0" : "#64748b",
                  display: "block",
                };
                const body = (
                  <>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      {href ? table : `${table} · no page yet`}
                    </div>
                  </>
                );
                return href ? (
                  <a key={table} href={href} style={boxStyle}>{body}</a>
                ) : (
                  <div key={table} style={boxStyle}>{body}</div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Quick Actions */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#f59e0b",
            borderBottom: "1px solid #334155",
            paddingBottom: "8px",
            marginBottom: "16px",
          }}>
            ⚡ Quick Actions
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: "12px",
          }}>
            {[
              { label: "👥 People & Roles", href: "/admin/users", desc: "Make someone a teacher" },
            ].map((action) => (
              <a
                key={action.label}
                href={action.href}
                style={{
                  background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                  borderRadius: "8px",
                  padding: "16px",
                  border: "1px solid #334155",
                  textDecoration: "none",
                  color: "#e2e8f0",
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 500 }}>{action.label}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  {action.desc}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* API Routes Reference */}
        <section>
          <h2 style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#64748b",
            borderBottom: "1px solid #334155",
            paddingBottom: "8px",
            marginBottom: "16px",
          }}>
            📡 API Health
          </h2>
          <div style={{
            background: "#1e293b",
            borderRadius: "8px",
            padding: "16px",
            border: "1px solid #334155",
            fontSize: "13px",
            fontFamily: "monospace",
            color: "#94a3b8",
          }}>
            <a href="/api/health" target="_blank" style={{ color: "#10b981" }}>
              GET /api/health
            </a>
            {" — Check API and database status"}
          </div>
        </section>
      </main>
    </div>
  );
  });
}

/**
 * Fetch every room currently open on LiveKit — the actual billing/live
 * source of truth — and match each back to its session row for display.
 * A room can be live here even if its DB session status disagrees.
 */
async function getLiveClasses() {
  try {
    const rooms = await getRoomServiceClient().listRooms();
    if (rooms.length === 0) return [];

    const sessionIds = rooms.map((r) => r.name.replace(/^qlms-/, ""));
    const matchedSessions = await db.query.sessions.findMany({
      where: inArray(sessions.id, sessionIds),
      with: { teacher: { columns: { name: true } } },
    });
    const byId = new Map(matchedSessions.map((s) => [s.id, s]));
    // Fallback for rooms whose videoRoomName was set explicitly instead of
    // following the default qlms-<sessionId> naming.
    const byVideoRoomName = new Map(
      matchedSessions.filter((s) => s.videoRoomName).map((s) => [s.videoRoomName, s])
    );

    return rooms.map((r) => {
      const session = byId.get(r.name.replace(/^qlms-/, "")) || byVideoRoomName.get(r.name);
      return {
        name: r.name,
        numParticipants: r.numParticipants,
        creationTime: r.creationTime ? Number(r.creationTime) * 1000 : null,
        session: session
          ? { id: session.id, title: session.title, track: session.track, teacherName: session.teacher.name }
          : null,
      };
    });
  } catch {
    // LiveKit unreachable or not configured — don't break the whole page.
    return [];
  }
}

/**
 * Fetch row counts for key tables to display on the dashboard.
 */
async function getTableCounts() {
  try {
    const counts = await Promise.all([
      db.execute(sql`SELECT count(*)::int as c FROM organizations`),
      db.execute(sql`SELECT count(*)::int as c FROM users`),
      db.execute(sql`SELECT count(*)::int as c FROM student_profiles`),
      db.execute(sql`SELECT count(*)::int as c FROM subscriptions`),
      db.execute(sql`SELECT count(*)::int as c FROM sessions`),
      db.execute(sql`SELECT count(*)::int as c FROM bookings`),
    ]);

    return [
      { label: "Organizations", count: (counts[0] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Users", count: (counts[1] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Student Profiles", count: (counts[2] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Subscriptions", count: (counts[3] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Sessions", count: (counts[4] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Bookings", count: (counts[5] as unknown as { c: number }[])[0]?.c ?? 0 },
    ];
  } catch {
    // If DB is not connected, show zeros
    return [
      { label: "Organizations", count: 0 },
      { label: "Users", count: 0 },
      { label: "Student Profiles", count: 0 },
      { label: "Subscriptions", count: 0 },
      { label: "Sessions", count: 0 },
      { label: "Bookings", count: 0 },
    ];
  }
}
