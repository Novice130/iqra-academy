import { test, expect } from "../fixtures/test";
import fs from "fs";
import path from "path";
import {
  getClassActionState,
  LATE_JOIN_MS,
  type ClassActionSession,
  type ClassActionViewer,
} from "../../src/lib/class-action";
import { SCHEDULED_AFTER_MS } from "../../src/lib/meeting-service";

test.describe("Phase 8: Visual System & Every Active Page", () => {
  const webRoot = path.resolve(__dirname, "../../");

  test("globals.css contains canonical Phase 8 design tokens, glass system, and a11y fallbacks", () => {
    const cssPath = path.join(webRoot, "src/app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    // Color tokens
    expect(cssContent).toContain("#F5F7FA"); // Light app background
    expect(cssContent).toContain("#17202A"); // Primary text
    expect(cssContent).toContain("#0A84FF"); // Accent blue
    expect(cssContent).toContain("#30D158"); // Success green
    expect(cssContent).toContain("#FF9F0A"); // Warning orange
    expect(cssContent).toContain("#FF453A"); // Danger red
    expect(cssContent).toContain("#090B0F"); // Meeting dark background

    // Glass material & tokens
    expect(cssContent).toContain("rgba(28, 32, 40, 0.72)");
    expect(cssContent).toContain("24px"); // Blur
    expect(cssContent).toContain("160%"); // Saturation
    expect(cssContent).toContain("0 18px 60px rgba(0, 0, 0, 0.32)"); // Shadow

    // Radii tokens
    expect(cssContent).toContain("12px"); // Controls
    expect(cssContent).toContain("16px"); // Cards
    expect(cssContent).toContain("22px"); // Dialogs / docks

    // Minimum targets
    expect(cssContent).toContain("44px"); // Touch target
    expect(cssContent).toContain("48px"); // Primary class action target

    // Accessibility fallbacks
    expect(cssContent).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("DashboardChrome implements exact 264px sidebar, tablet compact rail, and mobile bottom bar", () => {
    const chromePath = path.join(webRoot, "src/app/dashboard/DashboardChrome.tsx");
    const chromeContent = fs.readFileSync(chromePath, "utf-8");

    // Desktop sidebar: 264px
    expect(chromeContent).toContain("w-[264px]");

    // Tablet compact rail (640-1023px)
    expect(chromeContent).toContain("hidden sm:flex lg:hidden flex-col w-16 shrink-0");

    // Mobile bottom navigation bar (<640px)
    expect(chromeContent).toContain("sm:hidden flex-none grid grid-flow-col auto-cols-fr");

    // Notification banner route correction to /dashboard/billing
    const bannerPath = path.join(webRoot, "src/app/dashboard/MeetingNotificationBanner.tsx");
    const bannerContent = fs.readFileSync(bannerPath, "utf-8");
    expect(bannerContent).toContain("/dashboard/billing");
    expect(bannerContent).not.toContain("/dashboard/invoices");

    // Instant Meeting button naming
    const buttonPath = path.join(webRoot, "src/app/dashboard/teacher/StartInstantMeetingButton.tsx");
    const buttonContent = fs.readFileSync(buttonPath, "utf-8");
    expect(buttonContent).toContain("⚡ Instant Meeting");
    expect(buttonContent).not.toContain("⚡ Start Class");
  });

  test("Class action and meeting service scheduling windows are unified at T+180", () => {
    expect(SCHEDULED_AFTER_MS).toBe(LATE_JOIN_MS);
    expect(SCHEDULED_AFTER_MS).toBe(3 * 60 * 60 * 1000); // 180 mins
  });

  test("getClassActionState distinguishes assigned teacher from other teachers", () => {
    const session: ClassActionSession = {
      id: "session-123",
      status: "SCHEDULED",
      teacherId: "teacher-assigned-1",
      scheduledStart: new Date(Date.now() + 5 * 60 * 1000), // In 5 mins -> READY
      scheduledEnd: new Date(Date.now() + 35 * 60 * 1000),
    };

    // 1. Assigned teacher -> host with Start Class
    const assignedTeacherViewer: ClassActionViewer = {
      userId: "teacher-assigned-1",
      role: "TEACHER",
    };
    const assignedState = getClassActionState(session, assignedTeacherViewer);
    expect(assignedState.isHost).toBe(true);
    expect(assignedState.label).toBe("Start Class");

    // 2. Different teacher in same org -> NOT host, doesn't get Start Class label
    const otherTeacherViewer: ClassActionViewer = {
      userId: "teacher-other-2",
      role: "TEACHER",
    };
    const otherState = getClassActionState(session, otherTeacherViewer);
    expect(otherState.isHost).toBe(false);
    expect(otherState.label).toBe("Join Class");
  });

  test("Teacher students progress calculation avoids operator precedence bug", () => {
    const studentsPagePath = path.join(webRoot, "src/app/dashboard/teacher/students/page.tsx");
    const content = fs.readFileSync(studentsPagePath, "utf-8");

    // Must have the fixed expression with parenthesis
    expect(content).toContain("Math.min(100, Math.round(((completed[0]?.count || 0) / totalInTrack) * 100))");

    // Verify mathematical accuracy
    const totalInTrack = 20;
    const completedCount = 5;
    const correctProgress = Math.min(100, Math.round(((completedCount || 0) / totalInTrack) * 100));
    expect(correctProgress).toBe(25);

    // Old bug check: 5 || (0 / 20) would have evaluated to 500%
    const buggyProgress = Math.round(((completedCount || 0 / totalInTrack)) * 100);
    expect(buggyProgress).toBe(500);
  });

  test("Active pages have no fake streak, placeholder cards, or fake online badges", () => {
    // 1. Student Dashboard Home
    const studentHomePath = path.join(webRoot, "src/app/dashboard/page.tsx");
    const studentHome = fs.readFileSync(studentHomePath, "utf-8");
    expect(studentHome).not.toContain('label="Streak" value="--"');
    expect(studentHome).not.toContain('weekly="--"');

    // 2. Student Progress
    const progressPath = path.join(webRoot, "src/app/dashboard/progress/page.tsx");
    const progressContent = fs.readFileSync(progressPath, "utf-8");
    expect(progressContent).not.toContain("-- 🔥");
    expect(progressContent).not.toContain("week streak");

    // 3. Chat Page
    const chatPath = path.join(webRoot, "src/app/dashboard/chat/page.tsx");
    const chatContent = fs.readFileSync(chatPath, "utf-8");
    expect(chatContent).not.toContain("bg-emerald-400 animate-pulse");
    expect(chatContent).not.toContain("Online");

    // 4. Teacher Home Live Matrix Isolation
    const teacherHomePath = path.join(webRoot, "src/app/dashboard/teacher/page.tsx");
    const teacherHome = fs.readFileSync(teacherHomePath, "utf-8");
    expect(teacherHome).not.toContain("isAdmin && rawSessions");
  });

  test("Debug routes are blocked in production via layout notFound()", () => {
    const layoutPath = path.join(webRoot, "src/app/debug/layout.tsx");
    expect(fs.existsSync(layoutPath)).toBe(true);

    const layoutContent = fs.readFileSync(layoutPath, "utf-8");
    expect(layoutContent).toContain('process.env.NODE_ENV === "production"');
    expect(layoutContent).toContain("notFound()");
  });

  test("Legal pages enforce 720px max measure with Table of Contents and metadata", () => {
    // Terms
    const termsPath = path.join(webRoot, "src/app/terms/page.tsx");
    const termsContent = fs.readFileSync(termsPath, "utf-8");
    expect(termsContent).toContain("max-w-[720px]");
    expect(termsContent).toContain("Table of Contents");
    expect(termsContent).toContain('href="#section-1"');
    expect(termsContent).toContain("Last updated:");

    // Privacy
    const privacyPath = path.join(webRoot, "src/app/privacy/page.tsx");
    const privacyContent = fs.readFileSync(privacyPath, "utf-8");
    expect(privacyContent).toContain("max-w-[720px]");
    expect(privacyContent).toContain("Table of Contents");
    expect(privacyContent).toContain('href="#privacy-1"');
    expect(privacyContent).toContain("Last updated:");
  });

  test("Auth and Join pages have password eye toggle, 420px cards, and expired states", () => {
    // Login
    const loginPath = path.join(webRoot, "src/app/login/page.tsx");
    const loginContent = fs.readFileSync(loginPath, "utf-8");
    expect(loginContent).toContain("max-w-[420px]");
    expect(loginContent).toContain("showPassword");
    expect(loginContent).toContain('aria-label={showPassword ? "Hide password" : "Show password"}');

    // Register
    const registerPath = path.join(webRoot, "src/app/register/page.tsx");
    const registerContent = fs.readFileSync(registerPath, "utf-8");
    expect(registerContent).toContain("max-w-[420px]");
    expect(registerContent).toContain("showPassword");
    expect(registerContent).toContain('aria-label={showPassword ? "Hide password" : "Show password"}');

    // Join
    const joinPath = path.join(webRoot, "src/app/join/[id]/page.tsx");
    const joinContent = fs.readFileSync(joinPath, "utf-8");
    expect(joinContent).toContain("'expired'");
    expect(joinContent).toContain("Request Expired");
    expect(joinContent).toContain("Try Again");
  });
});
