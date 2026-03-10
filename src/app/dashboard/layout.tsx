/**
 * Dashboard Layout — Clean sidebar + auth guard
 *
 * Apple-inspired: Light sidebar, minimal icons, generous spacing.
 * Server component — checks auth and redirects if not logged in.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) {
    redirect("/login");
  }

  const user = session.user as { name?: string; email?: string; role?: string };
  const initials = (user.name || "U").charAt(0).toUpperCase();

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--bg-secondary)" }}
    >
      {/* Sidebar */}
      <aside
        className="hidden lg:flex flex-col w-60 shrink-0"
        style={{
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-5 h-16"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <img
            src="/logo.svg"
            alt="Iqra Academy"
            className="w-7 h-7 rounded-md object-cover"
          />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Iqra Academy
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          <SidebarItem href="/dashboard" label="Home" />
          <SidebarItem href="/dashboard/booking" label="Book a Class" />
          <SidebarItem href="/dashboard/progress" label="Progress" />
          <SidebarItem href="/dashboard/chat" label="Messages" />
          <SidebarItem href="/dashboard/schedule" label="Schedule" />

          <div className="pt-5 pb-1.5 px-3">
            <div
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)" }}
            >
              Account
            </div>
          </div>
          <SidebarItem href="/dashboard/settings" label="Settings" />
          <SidebarItem href="/dashboard/billing" label="Billing" />

          {user.role === "TEACHER" && (
            <>
              <div className="pt-5 pb-1.5 px-3">
                <div
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Teaching
                </div>
              </div>
              <SidebarItem href="/dashboard/teacher" label="Teacher Home" />
              <SidebarItem
                href="/dashboard/teacher/students"
                label="My Students"
              />
              <SidebarItem
                href="/dashboard/teacher/availability"
                label="Availability"
              />
            </>
          )}

          {(user.role === "ORG_ADMIN" || user.role === "SUPER_ADMIN") && (
            <>
              <div className="pt-5 pb-1.5 px-3">
                <div
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Admin
                </div>
              </div>
              <SidebarItem href="/admin" label="Admin Panel" />
            </>
          )}
        </nav>

        {/* User */}
        <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {user.name || "User"}
              </div>
              <div
                className="text-xs truncate"
                style={{ color: "var(--text-tertiary)" }}
              >
                {user.email}
              </div>
            </div>
          </div>
          <a
            href="/api/auth/sign-out"
            className="mt-3 flex items-center justify-center w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Sign Out
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header
          className="flex items-center justify-between px-5 h-14 lg:hidden"
          style={{
            background: "var(--bg-elevated)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2">
            <img
              src="/logo.svg"
              alt="Iqra Academy"
              className="w-7 h-7 rounded-md object-cover"
            />
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Iqra Academy
            </span>
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            {initials}
          </div>
        </header>

        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}

function SidebarItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
      style={{ color: "var(--text-secondary)" }}
      // hover styles handled by tailwind
    >
      {label}
    </Link>
  );
}
