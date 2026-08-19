import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security headers applied to every response that passes through the worker.
 * OpenNext/Workers ignores `headers()` in next.config, so the middleware is
 * the one place these can live.
 *
 * CSP notes (do not tighten without testing in a real class):
 * - `wasm-unsafe-eval` — MediaPipe Tasks Vision (background segmentation)
 *   instantiates WebAssembly from a runtime-fetched model.
 * - `worker-src blob:` — MediaPipe spins its inference up in a blob worker.
 * - `style-src 'unsafe-inline'` — React `style={{}}` props and LiveKit
 *   component styles are style *attributes*, which CSP only allows via
 *   'unsafe-inline' in style-src (style-src-attr support is inconsistent).
 * - `connect-src wss:`/`https:` to LiveKit Cloud and the MediaPipe WASM CDN.
 * - `frame-ancestors 'self'` — the site is never legitimately framed.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "connect-src 'self' https://cdn.jsdelivr.net wss://*.livekit.cloud https://*.livekit.cloud wss://meet.novicetutor.com https://accounts.google.com https://fonts.googleapis.com https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "object-src 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy":
    "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url), {
      headers: SECURITY_HEADERS,
    });
  }

  const response = NextResponse.next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    // Exclude static assets and images — these are served by the Worker's
    // asset binding and never need to enter middleware.
    "/((?!_next/static|_next/image|favicon.ico|logo.png|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|apk)$).*)",
  ],
};
