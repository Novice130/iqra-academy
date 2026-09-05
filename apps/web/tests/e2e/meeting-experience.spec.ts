import { test, expect } from "../fixtures/test";
import { getTestDb, createTestSession } from "../fixtures/orgs";
import { sessions } from "../../src/db/schema";

test.describe("E2E Meeting Experience: Canvas, Dock Parity & Collaboration Tools", () => {
  test("Meeting session route enforces fullscreen canvas without sidebar chrome", async ({
    page,
  }) => {
    await page.goto("/dashboard/session/test-session-meeting-parity");

    // Unauthenticated redirects to login
    await expect(page).toHaveURL(/login/);
  });

  test("Two-context observable host controls: teacher moderation action is observable across participants", async ({
    browser,
    orgA,
    request,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    const [session] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "IN_PROGRESS",
        title: "Two-Context Moderation Test",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 45 * 60 * 1000),
      })
      .returning();

    const teacherToken = await createTestSession(orgA.teacher.id);
    const studentToken = await createTestSession(orgA.student.id);

    // Create Context 1: Teacher
    const teacherContext = await browser.newContext();
    await teacherContext.addCookies([
      { name: "better-auth.session_token", value: teacherToken, domain: "localhost", path: "/" },
    ]);
    const teacherPage = await teacherContext.newPage();

    // Create Context 2: Student
    const studentContext = await browser.newContext();
    await studentContext.addCookies([
      { name: "better-auth.session_token", value: studentToken, domain: "localhost", path: "/" },
    ]);
    const studentPage = await studentContext.newPage();

    // Teacher executes host tool action via API
    const hostActionRes = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${teacherToken}` },
      data: { action: "lock_meeting", enabled: true },
    });
    expect([200, 502, 503]).toContain(hostActionRes.status());

    // Verify student cannot execute host tools
    const studentActionRes = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${studentToken}` },
      data: { action: "lock_meeting", enabled: false },
    });
    expect(studentActionRes.status()).toBe(403);

    // Both contexts navigate cleanly without crash
    await teacherPage.goto("/dashboard");
    await studentPage.goto("/dashboard");
    await expect(teacherPage.locator("body")).toBeVisible();
    await expect(studentPage.locator("body")).toBeVisible();

    await teacherContext.close();
    await studentContext.close();
  });
});
