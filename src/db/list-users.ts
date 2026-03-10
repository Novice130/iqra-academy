import * as dotenv from "dotenv";
import path from "path";

// Load .env from the root
dotenv.config({ path: path.join(__dirname, "../../.env") });

import { db } from "../lib/db";
import { users } from "./schema";

async function main() {
  console.log("Connecting to DB...");
  try {
    const allUsers = await db.select().from(users);
    console.log("Registered Users:");
    allUsers.forEach(u => {
      console.log(`- ${u.email} (${u.role})`);
    });
  } catch (err) {
    console.error("Database Query Failed:", err);
  }
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
