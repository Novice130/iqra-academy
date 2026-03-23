import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "./src/lib/db";
import { authSessions, users } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const email = "syedamer130@yahoo.com";
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  
  if (user) {
    console.log(`Current role for ${email}: ${user.role}`);
    
    // Force role to ORG_ADMIN
    await db.update(users).set({ role: "ORG_ADMIN" }).where(eq(users.id, user.id));
    console.log(`Updated role to ORG_ADMIN.`);
    
    // Clear sessions
    await db.delete(authSessions).where(eq(authSessions.userId, user.id));
    console.log("Sessions cleared.");
    
  } else {
    console.log("User not found.");
  }
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
