import "dotenv/config";
import { db, withDb } from "../src/lib/db";
import { sessions } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { generateLiveKitToken, generateRoomName } from "../src/lib/livekit";

async function main() {
  await withDb(async () => {
    const sessionId = "testclass_group";
    const roomName = generateRoomName(sessionId);
    const now = new Date();

    await db
      .update(sessions)
      .set({
        status: "IN_PROGRESS",
        actualStart: now,
        videoRoomName: roomName,
      })
      .where(eq(sessions.id, sessionId));

    console.log("=== TEST CLASS STARTED ===");
    console.log("Session ID:", sessionId);
    console.log("Room Name:", roomName);
    console.log("Teacher Join URL: https://novicetutor.com/dashboard/session/" + sessionId);
    console.log("Student Join URL: https://novicetutor.com/dashboard/session/" + sessionId);
    console.log("Guest Join URL: https://novicetutor.com/join/" + sessionId);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
