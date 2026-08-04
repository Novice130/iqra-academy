import { db } from "./src/lib/db";
import { users, studentProfiles } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const allUsers = await db.select().from(users);
  console.log("Users:", allUsers.map(u => ({ id: u.id, email: u.email, role: u.role, name: u.name })));

  const allStudents = await db.select().from(studentProfiles);
  console.log("Students:", allStudents.map(s => ({ id: s.id, name: s.name, userId: s.userId })));
}
run().then(() => process.exit(0)).catch(e => console.error(e));
