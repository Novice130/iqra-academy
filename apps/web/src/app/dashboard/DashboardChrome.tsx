'use client';

/**
 * Dashboard Chrome — sidebar + mobile header shell.
 *
 * Client component so it can read the current path and skip its own chrome
 * on the live call route: a video call should be fullscreen/immersive like
 * Zoom, not squeezed next to a 240px nav sidebar.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useCallback, useEffect } from "react";
import MeetingNotificationBanner from "./MeetingNotificationBanner";
import LiveClassRibbon from "./LiveClassRibbon";
import IncomingCallOverlay from "./IncomingCallOverlay";
import PushRegistrar from "./PushRegistrar";
import TeacherAvailabilityModal from "@/components/TeacherAvailabilityModal";
import { authClient } from "@/lib/auth-client";
import { NAV, navRole, isActive, moreItems, titleFor, type NavIcon, type NavGroup } from "./nav";

interface DashboardUser {
  name?: string;
  email?: string;
  role?: string;
  orgId?: string;
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
  const isCallRoute = pathname?.startsWith("/dashboard/session/");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
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
  const role = navRole(user.role);
  const nav = NAV[role];
  const isTeachingRole = role !== "student";
  const tabs = nav.tabs;

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--bg-secondary)" }}
    >
      <IncomingCallOverlay />
      <PushRegistrar />

      {/* Desktop Sidebar (264px) */}
      <aside
        className="hidden lg:flex flex-col w-[264px] shrink-0"
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
            src="/logo.png?v=3"
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
          <NavGroups groups={nav.groups} />
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

      {/* Tablet Compact Rail (640px - 1023px) */}
      <aside
        className="hidden sm:flex lg:hidden flex-col w-16 shrink-0 items-center py-3"
        style={{
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div className="p-2 mb-2">
          <img src="/logo.png?v=3" alt="Novice Tutor" className="w-8 h-8 object-contain" />
        </div>
        <nav className="flex-1 flex flex-col items-center gap-2 w-full px-1">
          {tabs.map((tab) => {
            const active = isActive(tab.href, pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                title={tab.label}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  active
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "text-[var(--text-tertiary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                }`}
              >
                <TabIcon icon={tab.icon} filled={active} />
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          title="More options"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:bg-white/5 cursor-pointer"
        >
          <MoreIcon />
        </button>
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
                src="/logo.png?v=3"
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
                {titleFor(pathname ?? "", role)}
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
                  <NavGroups groups={nav.groups} onNavigate={() => setMobileMenuOpen(false)} />
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
        <TeacherAvailabilityModal />
        <div className="flex-1 overflow-auto">{children}</div>

        {/* Native mobile bottom bar (< 640px) */}
        <nav
          className="sm:hidden flex-none grid grid-flow-col auto-cols-fr bg-[var(--bg-elevated)] border-t border-[var(--border)] pb-[env(safe-area-inset-bottom,0px)]"
          aria-label="Mobile Navigation"
        >
          {tabs.map((tab) => {
            const active = isActive(tab.href, pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`app-tab${active ? " is-active text-[var(--accent)] font-semibold" : ""}`}
              >
                <TabIcon icon={tab.icon} filled={active} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="app-tab cursor-pointer"
          >
            <MoreIcon />
            <span>More</span>
          </button>
        </nav>
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
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);

  const closeMore = useCallback(() => {
    setMoreOpen(false);
    moreTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMore();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen, closeMore]);

  const role = navRole(user.role);
  const nav = NAV[role];
  const isTeachingRole = role !== "student";
  const tabs = nav.tabs;

  const title = titleFor(pathname, role);
  const isHome = pathname === "/dashboard" || pathname === "/dashboard/teacher" || pathname === "/admin";

  return (
    <div className="app-shell" style={{ background: "var(--bg-secondary)" }}>
      <IncomingCallOverlay />
      <PushRegistrar />

      <header className="app-header">
        <h1 className="app-title">{title}</h1>
      </header>

      {!isTeachingRole && <LiveClassRibbon />}
      <MeetingNotificationBanner />
      <TeacherAvailabilityModal />

      <main className={`app-scroll${isHome ? " is-home" : ""}`}>{children}</main>

      <nav className="app-tabbar" aria-label="Main">
        {tabs.map((tab) => {
          const active = isActive(tab.href, pathname);
          return (
            <Link key={tab.href} href={tab.href} className={`app-tab${active ? " is-active" : ""}`}>
              <TabIcon icon={tab.icon} filled={active} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreTriggerRef}
          type="button"
          onClick={() => setMoreOpen(true)}
          className="app-tab"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
        >
          <MoreIcon />
          <span>More</span>
        </button>
      </nav>

      {/* More opens as a sheet from the bottom — the phone idiom for a
          secondary menu, and reachable by the thumb that opened it. */}
      {moreOpen && (
        <>
          <div className="app-sheet-scrim" onClick={closeMore} />
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
              {moreItems(nav).map((item) => (
                <SheetLink key={item.href} href={item.href} label={item.label} onNavigate={closeMore} />
              ))}
            </div>
            <button
              onClick={() => {
                closeMore();
                onSignOut();
              }}
              className="app-sheet-signout"
            >
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
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

function NavGroups({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <>
      {groups.map((group, i) => (
        <div key={group.label ?? i} className={i > 0 ? "pt-4" : ""}>
          {group.label && (
            <div className="pb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              {group.label}
            </div>
          )}
          {group.items.map((item) => (
            <SidebarItem key={item.href} href={item.href} label={item.label} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </>
  );
}

function TabIcon({ icon, filled }: { icon: NavIcon; filled?: boolean }) {
  switch (icon) {
    case "home":
      return <HomeIcon filled={filled} />;
    case "calendar":
      return <CalendarIcon filled={filled} />;
    case "chart":
      return <ChartIcon filled={filled} />;
    case "chat":
      return <ChatIcon filled={filled} />;
    case "people":
      return <PeopleIcon filled={filled} />;
    case "receipt":
      return <ReceiptIcon filled={filled} />;
  }
}

function ReceiptIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" strokeLinecap="round" stroke={filled ? "var(--bg-elevated)" : "currentColor"} />
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
  const pathname = usePathname();
  const active = isActive(href, pathname);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
        active
          ? "bg-emerald-500/10 font-semibold"
          : "hover:bg-white/5"
      }`}
      style={{
        color: active ? "var(--accent, #10b981)" : "var(--text-secondary)",
      }}
    >
      {label}
    </Link>
  );
}

