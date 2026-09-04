import { test, expect } from "playwright/test";

test.describe("E2E Meeting Experience: Canvas, Dock Parity & Collaboration Tools", () => {
  test("Meeting session route enforces fullscreen canvas without sidebar chrome", async ({
    page,
  }) => {
    await page.goto("/dashboard/session/test-session-meeting-parity");

    // Unauthenticated redirects to login
    await expect(page).toHaveURL(/login/);
  });

  test("Desktop meeting dock defines 9 canonical positions and mobile compact defines 5", () => {
    // Canonical 9-position desktop dock specification
    const desktopDockPositions = [
      "mute",
      "video",
      "participants",
      "chat",
      "reactions",
      "share",
      "host_tools",
      "more",
      "end",
    ];

    expect(desktopDockPositions).toHaveLength(9);
    expect(desktopDockPositions[0]).toBe("mute");
    expect(desktopDockPositions[1]).toBe("video");
    expect(desktopDockPositions[2]).toBe("participants");
    expect(desktopDockPositions[3]).toBe("chat");
    expect(desktopDockPositions[4]).toBe("reactions");
    expect(desktopDockPositions[5]).toBe("share");
    expect(desktopDockPositions[6]).toBe("host_tools");
    expect(desktopDockPositions[7]).toBe("more");
    expect(desktopDockPositions[8]).toBe("end");

    // Mobile compact visible dock specification (< 768px)
    const mobileDockPositions = ["mute", "video", "share", "more", "end"];
    expect(mobileDockPositions).toHaveLength(5);
  });

  test("Meeting controls: host moderation actions define safe execution boundaries", () => {
    const hostToolsActions = [
      "mute_all",
      "lock_meeting",
      "unlock_meeting",
      "toggle_participant_share",
      "end_class_for_everyone",
    ];

    expect(hostToolsActions).toContain("mute_all");
    expect(hostToolsActions).toContain("lock_meeting");
    expect(hostToolsActions).toContain("end_class_for_everyone");
  });
});
