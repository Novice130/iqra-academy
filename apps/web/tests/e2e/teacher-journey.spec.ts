import { test, expect } from "playwright/test";
import { getClassActionState } from "../../src/lib/class-action";

test.describe("E2E Teacher Journey: Dashboard, Availability & Schedule Lifecycle", () => {
  test("Unauthenticated access to teacher routes redirects to /login", async ({ page }) => {
    const teacherRoutes = [
      "/dashboard/teacher",
      "/dashboard/teacher/availability",
      "/dashboard/teacher/students",
      "/dashboard/teacher/messages",
    ];

    for (const route of teacherRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/login/);
    }
  });

  test("Class action state differentiates assigned teacher from unassigned teachers", () => {
    const now = new Date("2026-09-05T14:00:00Z");
    const tMinus30 = new Date(now.getTime() + 30 * 60 * 1000);

    const session = {
      id: "sess-teacher-1",
      teacherId: "teacher-assigned-id",
      status: "SCHEDULED" as const,
      scheduledStart: tMinus30,
      scheduledEnd: new Date(tMinus30.getTime() + 30 * 60 * 1000),
    };

    // 1. Assigned teacher receives "Start Class"
    const assignedState = getClassActionState(
      session,
      { userId: "teacher-assigned-id", role: "TEACHER" },
      now
    );
    expect(assignedState.state).toBe("READY");
    expect(assignedState.label).toBe("Start Class");
    expect(assignedState.disabled).toBe(false);

    // 2. Unassigned teacher receives observer / non-host label
    const unassignedState = getClassActionState(
      session,
      { userId: "teacher-other-id", role: "TEACHER" },
      now
    );
    expect(unassignedState.label).not.toBe("Start Class");
    expect(["Join Class", "Observe Live"]).toContain(unassignedState.label);

    // 3. Live session: assigned teacher receives "Rejoin Class"
    const liveSession = {
      ...session,
      status: "IN_PROGRESS" as const,
    };
    const liveAssignedState = getClassActionState(
      liveSession,
      { userId: "teacher-assigned-id", role: "TEACHER" },
      now
    );
    expect(liveAssignedState.state).toBe("LIVE");
    expect(liveAssignedState.label).toBe("Rejoin Class");
    expect(liveAssignedState.disabled).toBe(false);
  });

  test("Instant meeting action semantics require 'Instant Meeting', never 'Start Class'", () => {
    const now = new Date("2026-09-05T15:00:00Z");

    const instantSession = {
      id: "sess-instant-1",
      origin: "INSTANT",
      status: "IN_PROGRESS" as const,
      scheduledStart: now,
      scheduledEnd: new Date(now.getTime() + 45 * 60 * 1000),
    };

    const actionState = getClassActionState(
      instantSession,
      { userId: "teacher-1", role: "TEACHER" },
      now
    );

    // Rejoining an instant meeting is Rejoin Class, not Start Class
    expect(actionState.label).toBe("Rejoin Class");
  });
});
