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
  nativeApp = false,
  children,
}: {
  user: DashboardUser;
  nativeApp?: boolean;
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

  // Inside the app, phones get app chrome instead of website chrome: a title
  // bar and a bottom tab bar, no hamburger. The desktop sidebar still applies
  // at lg and above, because the same build runs in the parked desktop shell.
  if (nativeApp) {
    return (
      <AppChrome user={user} onSignOut={signOut} pathname={pathname ?? ""}>
        {children}
      </AppChrome>
    );
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
              {/* Teaching, not Admin: a teacher sees their own classes here,
                  an admin sees the whole org through the same page. */}
              <SidebarItem href="/dashboard/attendance" label="Attendance" />
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
        {/* Top Header — unified for mobile and desktop */}
        <header
          className="relative flex items-center justify-between px-5 h-14"
          style={{
            background: "var(--bg-elevated)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {/* Left: Brand on mobile, Page context on desktop */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 lg:hidden">
              <img
                src="/logo.png"
                alt="Novice Tutor"
                className="w-9 h-9 object-contain"
              />
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Novice Tutor
              </span>
            </div>
            <div className="hidden lg:flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {titleFor(pathname ?? "", isTeachingRole)}
              </span>
            </div>
          </div>

          {/* Right: User Account Profile Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-white/5"
              style={{ border: "1px solid var(--border)" }}
              aria-label="Account menu"
              aria-expanded={mobileMenuOpen}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: "var(--accent)" }}
              >
                {initials}
              </div>
              <span
                className="text-xs font-medium max-w-[120px] truncate hidden sm:inline"
                style={{ color: "var(--text-primary)" }}
              >
                {user.name || "Account"}
              </span>
            </button>
          </div>

          {mobileMenuOpen && (
            <>
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div
                className="absolute right-4 top-14 z-50 w-64 rounded-xl shadow-xl overflow-hidden animate-fadeIn"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 16px 36px rgba(0, 0, 0, 0.4)",
                }}
              >
                <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {user.name || "User"}
                  </div>
                  <div
                    className="text-xs truncate mt-0.5"
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
                      <SidebarItem href="/dashboard/attendance" label="Attendance" onNavigate={() => setMobileMenuOpen(false)} />
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

/**
 * The in-app frame: a title bar, the page, and a bottom tab bar.
 *
 * Five destinations at most, which is the constraint every phone platform
 * imposes for the same reason — a sixth is unreachable by thumb and nobody
 * finds it. Everything that does not earn a tab lives under More.
 */
function AppChrome({
  user,
  onSignOut,
  pathname,
  children,
}: {
  user: DashboardUser;
  onSignOut: () => void;
  pathname: string;
  children: React.ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isTeachingRole = ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role || "");
  const isAdminRole = user.role === "ORG_ADMIN" || user.role === "SUPER_ADMIN";

  const tabs = isTeachingRole
    ? [
        { href: "/dashboard/teacher", label: "Home", icon: HomeIcon },
        { href: "/dashboard/schedule", label: "Schedule", icon: CalendarIcon },
        { href: "/dashboard/teacher/students", label: "Students", icon: PeopleIcon },
        { href: "/dashboard/teacher/messages", label: "Messages", icon: ChatIcon },
      ]
    : [
        { href: "/dashboard", label: "Home", icon: HomeIcon },
        { href: "/dashboard/booking", label: "Book", icon: CalendarIcon },
        { href: "/dashboard/progress", label: "Progress", icon: ChartIcon },
        { href: "/dashboard/chat", label: "Messages", icon: ChatIcon },
      ];

  const title = titleFor(pathname, isTeachingRole);
  const isHome = pathname === "/dashboard" || pathname === "/dashboard/teacher";

  return (
    <div className="app-shell" style={{ background: "var(--bg-secondary)" }}>
      <IncomingCallOverlay />
      <PushRegistrar />

      {/* Title bar. Text-only and centred, the way a phone app labels where
          you are — no logo, because you already know whose app you opened. */}
      <header className="app-titlebar">
        <span className="app-title">{title}</span>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="app-avatar"
          aria-label="Account"
        >
          {(user.name || "U").charAt(0).toUpperCase()}
        </button>
      </header>

      {!isTeachingRole && <LiveClassRibbon />}
      <MeetingNotificationBanner />

      {/* is-home keeps the greeting ("Assalamu Alaikum, …"), which is not a
          page title and is not repeated in the bar. Every other page's <h1>
          says exactly what the bar above it already says. */}
      <main className={`app-scroll${isHome ? " is-home" : ""}`}>{children}</main>

      <nav className="app-tabbar" aria-label="Main">
        {tabs.map((tab) => {
          const active =
            tab.href === "/dashboard" || tab.href === "/dashboard/teacher"
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} className={`app-tab${active ? " is-active" : ""}`}>
              <tab.icon filled={active} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen(true)} className="app-tab">
          <MoreIcon />
          <span>More</span>
        </button>
      </nav>

      {/* More opens as a sheet from the bottom — the phone idiom for a
          secondary menu, and reachable by the thumb that opened it. */}
      {moreOpen && (
        <>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div className="app-sheet-scrim" onClick={() => setMoreOpen(false)} />
          <div className="app-sheet" role="dialog" aria-label="More">
            <div className="app-sheet-grip" />
            <div className="app-sheet-head">
              <div className="app-avatar app-avatar-lg">{(user.name || "U").charAt(0).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div className="app-sheet-name">{user.name || "User"}</div>
                <div className="app-sheet-email">{user.email}</div>
              </div>
            </div>
            <div className="app-sheet-list">
              {!isTeachingRole && <SheetLink href="/dashboard/schedule" label="Schedule" onNavigate={() => setMoreOpen(false)} />}
              <SheetLink href="/dashboard/settings" label="Settings" onNavigate={() => setMoreOpen(false)} />
              <SheetLink href="/dashboard/billing" label="Billing" onNavigate={() => setMoreOpen(false)} />
              {isTeachingRole && (
                <>
                  <SheetLink href="/dashboard/progress" label="Progress" onNavigate={() => setMoreOpen(false)} />
                  <SheetLink href="/dashboard/teacher/availability" label="Availability" onNavigate={() => setMoreOpen(false)} />
                  <SheetLink href="/dashboard/attendance" label="Attendance" onNavigate={() => setMoreOpen(false)} />
                </>
              )}
              {isAdminRole && <SheetLink href="/admin" label="Admin Panel" onNavigate={() => setMoreOpen(false)} />}
            </div>
            <button onClick={onSignOut} className="app-sheet-signout">
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function titleFor(pathname: string, isTeachingRole: boolean): string {
  const map: Record<string, string> = {
    "/dashboard": "Home",
    "/dashboard/booking": "Book a Class",
    "/dashboard/progress": "Progress",
    "/dashboard/chat": "Messages",
    "/dashboard/schedule": "Schedule",
    "/dashboard/settings": "Settings",
    "/dashboard/billing": "Billing",
    "/dashboard/teacher": "Home",
    "/dashboard/teacher/messages": "Messages",
    "/dashboard/teacher/students": "My Students",
    "/dashboard/teacher/availability": "Availability",
    "/dashboard/attendance": "Attendance",
  };
  return map[pathname] ?? (isTeachingRole ? "Teaching" : "Novice Tutor");
}

function SheetLink({ href, label, onNavigate }: { href: string; label: string; onNavigate: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} className="app-sheet-link">
      {label}
    </Link>
  );
}

/* Icons are inline paths rather than an icon package: five glyphs do not
   justify a dependency, and these ship with the markup instead of arriving a
   frame later. Filled when active, outlined when not — the standard way a tab
   bar shows where you are without relying on colour alone. */
function HomeIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}
function CalendarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
function ChartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="12" width="4" height="8" rx="1.2" />
      <rect x="10" y="7" width="4" height="13" rx="1.2" />
      <rect x="16" y="3" width="4" height="17" rx="1.2" />
    </svg>
  );
}
function ChatIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.5A8 8 0 1 1 21 12z" strokeLinejoin="round" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}
function PeopleIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" strokeLinecap="round" />
      <path d="M16 11.2A3.2 3.2 0 1 0 16 5M17.5 19.8h3.4c0-2.5-1.5-4.3-3.7-4.9" strokeLinecap="round" />
    </svg>
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
