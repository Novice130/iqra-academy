import * as dotenv from "dotenv";
import path from "path";

// Load .env from the root
dotenv.config({ path: path.join(__dirname, "../../.env") });

import { db } from "../lib/db";
import { users } from "./schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = "syedamer130@yahoo.com";
  console.log(`Upgrading ${email} to ORG_ADMIN...`);
  
  try {
    const result = await db
      .update(users)
      .set({ role: "ORG_ADMIN" })
      .where(eq(users.email, email))
      .returning();
      
    if (result.length > 0) {
      console.log("Success! Updated user:", result[0].email, "New Role:", result[0].role);
    } else {
      console.log("User not found. Check the email address.");
    }
  } catch (err) {
    console.error("Database Update Failed:", err);
  }
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
