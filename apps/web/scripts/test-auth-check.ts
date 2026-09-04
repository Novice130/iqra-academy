import "dotenv/config";
import { requireIsolatedDb } from "./lib/require-isolated-db";

requireIsolatedDb("test-auth-check");

import { auth } from "../src/lib/auth";
import { withDb } from "../src/lib/db";

/**
 * Not a literal. These are credentials for real accounts, and a checkout of
 * this repository is not the place for them — the same rule the iOS UI tests
 * and `AppConfig.devTestPassword` follow.
 */
const password = process.env.NT_PASSWORD;

async function main() {
  if (!password) {
    console.error("Set NT_PASSWORD to run this check.");
    process.exit(1);
  }
  await withDb(async () => {
    try {
      const res = await auth.api.signInEmail({
        body: { email: "testteacher@test.com", password },
      });
      console.log("Teacher sign-in SUCCESS:", res.user.email);
    } catch (e: any) {
      console.log("Teacher sign-in FAIL:", e.message);
    }

    try {
      const res = await auth.api.signInEmail({
        body: { email: "teststudent1@test.com", password },
      });
      console.log("Student1 sign-in SUCCESS:", res.user.email);
    } catch (e: any) {
      console.log("Student1 sign-in FAIL:", e.message);
    }
  });
  process.exit(0);
}

main();
