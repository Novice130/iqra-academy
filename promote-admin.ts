import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import "dotenv/config";

let connString = process.env.DATABASE_URL;
if (connString.includes("channel_binding=require")) {
  connString = connString.replace("&channel_binding=require", "");
}

const sql = postgres(connString, { ssl: "require", max: 1 });

async function run() {
  await sql`
    UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'live.test.2026@example.com';
  `;
  console.log("User promoted to SUPER_ADMIN!");
  await sql.end();
}

run().catch(async (e) => {
  console.error("Failed:", e);
  await sql.end();
  process.exit(1);
});
