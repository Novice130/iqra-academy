import "dotenv/config";
import { requireIsolatedDb } from "./lib/require-isolated-db";

requireIsolatedDb("check-users");

import { db } from "../src/lib/db";
import { users, accounts } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function check() {
  console.log("Checking DB users and accounts...\n");
  const allUsers = await db.query.users.findMany();
  console.log("Users in DB:", allUsers.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role })));

  const allAccounts = await db.query.accounts.findMany();
  console.log("\nAccounts in DB:", allAccounts.map(a => ({ id: a.id, userId: a.userId, providerId: a.providerId, accountId: a.accountId, hasPassword: !!a.password })));
}

check().catch(console.error).finally(() => process.exit(0));
