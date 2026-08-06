'use client';

/**
 * Dashboard Chrome — sidebar + mobile header shell.
 *
 * Client component so it can read the current path and skip its own chrome
 * on the live call route: a video call should be fullscreen/immersive like
 * Zoom, not squeezed next to a 240px nav sidebar.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import MeetingNotificationBanner from "./MeetingNotificationBanner";
import LiveClassRibbon from "./LiveClassRibbon";
import IncomingCallOverlay from "./IncomingCallOverlay";
import PushRegistrar from "./PushRegistrar";
import { authClient } from "@/lib/auth-client";

interface DashboardUser {
  name?: string;
  email?: string;
  role?: string;
}

export default function DashboardChrome({
  user,
  children,
}: {
  user: DashboardUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isCallRoute = pathname?.startsWith("/dashboard/session/");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const signOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (isCallRoute) {
    return <>{children}</>;
  }

  const initials = (user.name || "U").charAt(0).toUpperCase();
  const isTeachingRole = ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role || "");
  const isAdminRole = user.role === "ORG_ADMIN" || user.role === "SUPER_ADMIN";

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--bg-secondary)" }}
    >
      <IncomingCallOverlay />
      <PushRegistrar />

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
            src="/logo.png"
            alt="Novice Tutor"
            className="w-10 h-10 object-contain"
          />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Novice Tutor
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          <SidebarItem href="/dashboard" label="Home" />
          <SidebarItem href="/dashboard/booking" label="Book a Class" />
          <SidebarItem href="/dashboard/progress" label="Progress" />
          {!["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role || "") && (
            <SidebarItem href="/dashboard/chat" label="Messages" />
          )}
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

          {["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role || "") && (
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
              <SidebarItem href="/dashboard/teacher/messages" label="Messages" />
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
          <button
            onClick={signOut}
            className="mt-3 flex items-center justify-center w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header
          className="relative flex items-center justify-between px-5 h-14 lg:hidden"
          style={{
            background: "var(--bg-elevated)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Novice Tutor"
              className="w-10 h-10 object-contain"
            />
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Novice Tutor
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white cursor-pointer"
            style={{ background: "var(--accent)" }}
            aria-label="Account menu"
            aria-expanded={mobileMenuOpen}
          >
            {initials}
          </button>

          {mobileMenuOpen && (
            <>
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div
                className="absolute right-4 top-14 z-50 w-64 rounded-xl shadow-lg overflow-hidden"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
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

                <nav className="p-2 space-y-0.5 max-h-[60vh] overflow-auto">
                  <SidebarItem href="/dashboard" label="Home" onNavigate={() => setMobileMenuOpen(false)} />
                  <SidebarItem href="/dashboard/booking" label="Book a Class" onNavigate={() => setMobileMenuOpen(false)} />
                  <SidebarItem href="/dashboard/progress" label="Progress" onNavigate={() => setMobileMenuOpen(false)} />
                  {!isTeachingRole && (
                    <SidebarItem href="/dashboard/chat" label="Messages" onNavigate={() => setMobileMenuOpen(false)} />
                  )}
                  <SidebarItem href="/dashboard/schedule" label="Schedule" onNavigate={() => setMobileMenuOpen(false)} />
                  <SidebarItem href="/dashboard/settings" label="Settings" onNavigate={() => setMobileMenuOpen(false)} />
                  <SidebarItem href="/dashboard/billing" label="Billing" onNavigate={() => setMobileMenuOpen(false)} />

                  {isTeachingRole && (
                    <>
                      <SidebarItem href="/dashboard/teacher" label="Teacher Home" onNavigate={() => setMobileMenuOpen(false)} />
                      <SidebarItem href="/dashboard/teacher/messages" label="Messages" onNavigate={() => setMobileMenuOpen(false)} />
                      <SidebarItem href="/dashboard/teacher/students" label="My Students" onNavigate={() => setMobileMenuOpen(false)} />
                      <SidebarItem href="/dashboard/teacher/availability" label="Availability" onNavigate={() => setMobileMenuOpen(false)} />
                    </>
                  )}

                  {isAdminRole && (
                    <SidebarItem href="/admin" label="Admin Panel" onNavigate={() => setMobileMenuOpen(false)} />
                  )}
                </nav>

                <div className="p-2" style={{ borderTop: "1px solid var(--border)" }}>
                  <button
                    onClick={signOut}
                    className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    style={{
                      background: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </header>

        {!isTeachingRole && <LiveClassRibbon />}
        <MeetingNotificationBanner />
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}

function SidebarItem({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
      style={{ color: "var(--text-secondary)" }}
    >
      {label}
    </Link>
  );
}
