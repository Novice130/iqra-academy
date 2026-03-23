import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "./src/lib/db";
import { bookings, users } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const email = "student_test@example.com";
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  
  if (user) {
    console.log(`User ID: ${user.id}`);
    const myBookings = await db.select().from(bookings).where(eq(bookings.userId, user.id));
    console.log(`Bookings count: ${myBookings.length}`);
    console.log(myBookings);
  } else {
    console.log("User not found.");
  }
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
