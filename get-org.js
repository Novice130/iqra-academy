const postgres = require('postgres');
require('dotenv/config');

let connString = process.env.DATABASE_URL;
if (connString.includes("channel_binding=require")) {
  connString = connString.replace("&channel_binding=require", "");
}

const sql = postgres(connString, { ssl: "require", max: 1 });

async function run() {
  const orgs = await sql`SELECT id, slug FROM organizations`;
  console.log(JSON.stringify(orgs, null, 2));
  await sql.end();
}

run().catch(async (e) => {
  console.error("Failed:", e);
  await sql.end();
  process.exit(1);
});
