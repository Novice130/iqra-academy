import { db } from "./src/lib/db";
import { authSessions, users } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const user = await db.query.users.findFirst({ where: eq(users.email, "syedamer130@yahoo.com") });
  if (user) {
    await db.delete(authSessions).where(eq(authSessions.userId, user.id));
    console.log("Sessions deleted for admin");
  } else {
    console.log("Admin user not found");
  }
  process.exit(0);
}

run().catch(console.error);
