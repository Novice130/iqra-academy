import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Check for both the standard and the __Secure- prefixed cookie for production
  const sessionCookie = 
    request.cookies.get("better-auth.session_token") || 
    request.cookies.get("__Secure-better-auth.session_token");

  // Define protected routes
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isAdminRoute = request.nextUrl.pathname.startsWith("/api/admin");

  if (!sessionCookie && (isDashboardRoute || isAdminRoute)) {
    if (isAdminRoute) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all dashboard routes
    "/dashboard/:path*",
    // Protect all admin API routes
    "/api/admin/:path*",
  ],
};
