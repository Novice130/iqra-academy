import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import "dotenv/config";

// Fix the connection string by removing the channel_binding parameter
// which causes issues with the JS driver
let connString = process.env.DATABASE_URL;
if (connString.includes("channel_binding=require")) {
  connString = connString.replace("&channel_binding=require", "");
}

const sql = postgres(connString, { ssl: "require", max: 1 });
const db = drizzle(sql);

async function run() {
  console.log("Creating organization...");
  
  await sql`
    INSERT INTO organizations (id, name, slug, domain, timezone, settings, created_at, updated_at)
    VALUES (
      'iqra_academy_main',
      'Iqra Academy',
      'iqra-academy',
      'learnnovice.com',
      'America/New_York',
      '{"brandColor": "#5c7c6f", "welcomeMessage": "Welcome to Iqra Academy"}'::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET 
      name = EXCLUDED.name,
      slug = EXCLUDED.slug;
  `;
  
  console.log("Organization created successfully.");
  await sql.end();
}

run().catch(async (e) => {
  console.error("Failed:", e);
  await sql.end();
  process.exit(1);
});
