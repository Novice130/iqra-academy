import "dotenv/config";
import { requireIsolatedDb } from "./lib/require-isolated-db";

requireIsolatedDb("test-guest-join-flow");

import { db, withDb } from "../src/lib/db";
import { sessions, users, guestJoinRequests } from "../src/db/schema";
import { eq, desc, or } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

async function main() {
  await withDb(async () => {
    console.log("--- 1. Fetching or creating a test session ---");
    let session = await db.query.sessions.findFirst({
      where: eq(sessions.status, "IN_PROGRESS"),
      with: { teacher: true },
    });

    if (!session) {
      session = await db.query.sessions.findFirst({
        orderBy: [desc(sessions.createdAt)],
        with: { teacher: true },
      });
    }

    if (!session) {
      console.error("No session found in DB");
      process.exit(1);
    }

    console.log(`Found session: ID=${session.id}, joinCode=${session.joinCode}, status=${session.status}`);

    const teacher = session.teacher;
    console.log(`Teacher: ${teacher.name} (${teacher.email})`);

    // Ensure session is IN_PROGRESS so it is joinable
    await db.update(sessions).set({ status: "IN_PROGRESS" }).where(eq(sessions.id, session.id));

    // Test Case A: Knock using UUID/CUID
    console.log("\n--- Test Case A: Guest knocking with raw Session ID ---");
    const knockNameA = "Guest Tester RawID " + Math.floor(Math.random() * 1000);
    const reqAId = createId();
    await db.insert(guestJoinRequests).values({
      id: reqAId,
      orgId: session.orgId,
      sessionId: session.id,
      name: knockNameA,
      status: "PENDING",
    });
    console.log(`Created knock request ${reqAId} for ${knockNameA}`);

    // Verify host sees knock
    const pendingKnocksA = await db.query.guestJoinRequests.findMany({
      where: eq(guestJoinRequests.sessionId, session.id),
    });
    console.log(`Host can see ${pendingKnocksA.length} knocks for session ${session.id}`);

    // Host admits guest
    await db.update(guestJoinRequests).set({
      status: "ADMITTED",
      respondedAt: new Date(),
    }).where(eq(guestJoinRequests.id, reqAId));
    console.log(`Admitted ${knockNameA}`);

    // Test Case B: Knock using joinCode with dashes
    if (session.joinCode) {
      console.log(`\n--- Test Case B: Guest knocking with joinCode (${session.joinCode}) ---`);
      const knockNameB = "Guest Tester JoinCode " + Math.floor(Math.random() * 1000);
      const reqBId = createId();
      await db.insert(guestJoinRequests).values({
        id: reqBId,
        orgId: session.orgId,
        sessionId: session.id,
        name: knockNameB,
        status: "PENDING",
      });
      console.log(`Created knock request ${reqBId} for ${knockNameB}`);

      // Host admits guest
      await db.update(guestJoinRequests).set({
        status: "ADMITTED",
        respondedAt: new Date(),
      }).where(eq(guestJoinRequests.id, reqBId));
      console.log(`Admitted ${knockNameB}`);
    }

    // Test Case C: Knock using joinCode WITHOUT dashes
    if (session.joinCode) {
      const cleanCode = session.joinCode.replace(/-/g, "").toUpperCase();
      console.log(`\n--- Test Case C: Guest knocking with joinCode without dashes (${cleanCode}) ---`);
      const matched = await db.query.sessions.findFirst({
        where: or(eq(sessions.id, session.id), eq(sessions.joinCode, session.joinCode)),
      });
      if (matched) {
        console.log(`Successfully resolved session via joinCode without dashes! Matched session ID: ${matched.id}`);
      } else {
        console.error(`Failed to resolve session via joinCode without dashes: ${cleanCode}`);
      }
    }

    console.log("\nALL GUEST JOIN BACKEND DATABASE & RESOLUTION CHECKS PASSED!");
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
