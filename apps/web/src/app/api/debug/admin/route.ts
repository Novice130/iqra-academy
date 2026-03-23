import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const secret = searchParams.get("secret");

  // Simple security check to prevent unauthorized use in production
  if (secret !== "debug123") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  try {
    const result = await db
      .update(users)
      .set({ role: "ORG_ADMIN" })
      .where(eq(users.email, email))
      .returning();

    if (result.length > 0) {
      return NextResponse.json({ 
        message: "Success", 
        user: result[0].email, 
        role: result[0].role 
      });
    } else {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
