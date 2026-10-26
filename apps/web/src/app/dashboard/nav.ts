/**
 * @fileoverview Navigation for every signed-in shell, one copy per role.
 *
 * DashboardChrome draws the same destinations in four places — the desktop
 * sidebar, the tablet rail, the account dropdown, and the in-app bottom bar
 * with its More sheet. Each used to have its own hand-written list, and they
 * had drifted apart. Change a destination here and all four follow.
 */

export type NavIcon = "home" | "calendar" | "chart" | "chat" | "people" | "receipt";

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  /** Shown above the group in the sidebar. Omitted for a role's only group. */
  label?: string;
  items: NavItem[];
}

export interface NavTab extends NavItem {
  icon: NavIcon;
}

export interface RoleNav {
  /** Sidebar and dropdown sections, in order. */
  groups: NavGroup[];
  /** Bottom bar and tablet rail: four at most, More opens the rest. */
  tabs: NavTab[];
}

export type NavRole = "admin" | "teacher" | "student";

export function navRole(role: string | undefined): NavRole {
  if (role === "ORG_ADMIN" || role === "SUPER_ADMIN") return "admin";
  if (role === "TEACHER") return "teacher";
  return "student";
}

const JOIN: NavItem = { href: "/join", label: "Join with code" };
const SETTINGS: NavItem = { href: "/dashboard/settings", label: "Settings" };

export const NAV: Record<NavRole, RoleNav> = {
  admin: {
    groups: [
      {
        label: "Operations",
        items: [
          { href: "/admin", label: "Overview" },
          { href: "/admin/live-classes", label: "Live now" },
          { href: "/admin/scheduled-classes", label: "Classes" },
          { href: "/admin/teacher-schedules", label: "Teacher schedules" },
          { href: "/admin/assign-student", label: "Book a class" },
          { href: "/dashboard/attendance", label: "Attendance" },
        ],
      },
      {
        label: "People",
        items: [
          { href: "/admin/students", label: "Students" },
          { href: "/admin/teachers", label: "Teachers" },
          { href: "/admin/trials", label: "Trial requests" },
          { href: "/admin/curriculum", label: "Curriculum" },
          { href: "/admin/users", label: "Users & roles" },
        ],
      },
      {
        label: "Billing",
        items: [
          { href: "/admin/invoices", label: "Invoices" },
          { href: "/admin/plans", label: "Plans" },
          { href: "/admin/coupons", label: "Coupons" },
          { href: "/admin/exports", label: "Exports" },
        ],
      },
      {
        label: "System",
        items: [
          { href: "/admin/audit", label: "Audit log" },
          { href: "/admin/system", label: "System health" },
        ],
      },
      {
        label: "Teaching",
        items: [
          { href: "/dashboard/teacher", label: "My classes" },
          { href: "/dashboard/teacher/messages", label: "Messages" },
        ],
      },
      { label: "Account", items: [JOIN, SETTINGS] },
    ],
    tabs: [
      { href: "/admin", label: "Overview", icon: "home" },
      { href: "/admin/scheduled-classes", label: "Classes", icon: "calendar" },
      { href: "/admin/students", label: "Students", icon: "people" },
      { href: "/admin/invoices", label: "Billing", icon: "receipt" },
    ],
  },
  teacher: {
    groups: [
      {
        label: "Teaching",
        items: [
          { href: "/dashboard/teacher", label: "Teacher home" },
          { href: "/dashboard/teacher/messages", label: "Messages" },
          { href: "/dashboard/teacher/students", label: "My students" },
          { href: "/dashboard/teacher/availability", label: "Availability" },
          { href: "/dashboard/attendance", label: "Attendance" },
          { href: "/dashboard/schedule", label: "Schedule" },
          JOIN,
        ],
      },
      { label: "Account", items: [SETTINGS] },
    ],
    tabs: [
      { href: "/dashboard/teacher", label: "Home", icon: "home" },
      { href: "/dashboard/schedule", label: "Schedule", icon: "calendar" },
      { href: "/dashboard/teacher/students", label: "Students", icon: "people" },
      { href: "/dashboard/teacher/messages", label: "Messages", icon: "chat" },
    ],
  },
  student: {
    groups: [
      {
        items: [
          { href: "/dashboard", label: "Home" },
          { href: "/dashboard/booking", label: "Book a class" },
          { href: "/dashboard/progress", label: "Progress" },
          { href: "/dashboard/chat", label: "Messages" },
          { href: "/dashboard/schedule", label: "Schedule" },
          JOIN,
        ],
      },
      { label: "Account", items: [SETTINGS, { href: "/dashboard/billing", label: "Billing" }] },
    ],
    tabs: [
      { href: "/dashboard", label: "Home", icon: "home" },
      { href: "/dashboard/booking", label: "Book", icon: "calendar" },
      { href: "/dashboard/progress", label: "Progress", icon: "chart" },
      { href: "/dashboard/chat", label: "Messages", icon: "chat" },
    ],
  },
};

/** Home routes match exactly; everything else matches its subtree. */
const EXACT = new Set(["/admin", "/dashboard", "/dashboard/teacher"]);

export function isActive(href: string, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (EXACT.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Everything a role can reach that isn't already a tab — what More shows. */
export function moreItems(nav: RoleNav): NavItem[] {
  const tabbed = new Set(nav.tabs.map((t) => t.href));
  return nav.groups.flatMap((g) => g.items).filter((i) => !tabbed.has(i.href));
}

/** The header title for a path: the longest nav label that matches it. */
export function titleFor(pathname: string, role: NavRole): string {
  if (pathname.startsWith("/dashboard/teacher/students/")) return "Student details";
  if (pathname === "/join" || pathname.startsWith("/join/")) return "Join class";
  let best: NavItem | null = null;
  for (const nav of [NAV[role], NAV.admin, NAV.teacher, NAV.student]) {
    for (const item of nav.groups.flatMap((g) => g.items)) {
      if (isActive(item.href, pathname) && (!best || item.href.length > best.href.length)) best = item;
    }
    if (best) break;
  }
  if (best) return best.label;
  return role === "student" ? "Novice Tutor" : "Teaching";
}
