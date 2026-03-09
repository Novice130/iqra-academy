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
import { canAccessAdmin, adminResources, adminBranding, adminMeta } from "@/lib/admin";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Server-side admin panel page.
 * Verifies auth and role before rendering.
 */
export default async function AdminPage() {
  // Verify authentication
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) {
    redirect("/login?redirect=/admin");
  }

  // Verify admin role
  const user = session.user as { role?: string };
  if (!canAccessAdmin(user.role || "STUDENT")) {
    redirect("/dashboard?error=unauthorized");
  }

  // Fetch table counts for the dashboard
  const tableCounts = await getTableCounts();

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
              {group.tables.map((table) => (
                <a
                  key={table}
                  href={`/admin/tables/${table}`}
                  style={{
                    background: "#1e293b",
                    borderRadius: "8px",
                    padding: "16px",
                    border: "1px solid #334155",
                    textDecoration: "none",
                    color: "#e2e8f0",
                    transition: "border-color 0.2s",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 500 }}>
                    {table.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    {table}
                  </div>
                </a>
              ))}
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
              { label: "🔍 View Audit Logs", href: "/admin/tables/audit_logs", desc: "Security & compliance" },
              { label: "💳 Manage Subscriptions", href: "/admin/tables/subscriptions", desc: "Billing & plans" },
              { label: "📊 CRM Sync Events", href: "/admin/tables/crm_sync_events", desc: "CRM integration status" },
              { label: "🎓 Lesson Content", href: "/admin/tables/lesson_content", desc: "Curriculum management" },
              { label: "📅 Teacher Availability", href: "/admin/tables/teacher_availability", desc: "Schedule management" },
              { label: "📧 Push Subscriptions", href: "/admin/tables/push_subscriptions", desc: "Notification management" },
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
