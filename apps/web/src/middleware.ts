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
 * - MediaPipe's WASM and model are served from **our own origin**
 *   (`/mediapipe/...`, staged by `scripts/copy-mediapipe.mjs`) precisely so
 *   this policy does not have to name a CDN. They used to come from
 *   cdn.jsdelivr.net and storage.googleapis.com; when this policy shipped it
 *   blocked the `<script>` tag MediaPipe injects for its WASM glue, and every
 *   background effect died silently. Do not "fix" that by widening
 *   `script-src` — put the file under `public/` instead.
 * - `script-src 'unsafe-inline'` — not optional, however much it wants to be.
 *   The App Router hands the client its server-rendered payload through inline
 *   `self.__next_f.push(...)` scripts. Without this the browser blocks every
 *   one of them, nothing hydrates, and production serves a white page on top
 *   of perfectly good HTML — which is what shipped on 2026-08-20 and took the
 *   live site down. `next dev` bootstraps differently and does NOT reproduce
 *   it, so this line cannot be judged from localhost.
 *
 *   The stronger fix is a per-request nonce, which Next stamps onto its own
 *   script tags. Not used here because a nonce makes every page dynamic, and
 *   this site's landing page is static and cached at the edge. Revisit that
 *   trade before tightening this back up.
 * - `worker-src blob:` — MediaPipe spins its inference up in a blob worker.
 * - `style-src 'unsafe-inline'` — React `style={{}}` props and LiveKit
 *   component styles are style *attributes*, which CSP only allows via
 *   'unsafe-inline' in style-src (style-src-attr support is inconsistent).
 * - `connect-src wss:`/`https:` to LiveKit Cloud. Nothing else is dialled
 *   cross-origin from a class; segmentation is same-origin now.
 * - `frame-ancestors 'self'` — the site is never legitimately framed.
 */
const isDev = process.env.NODE_ENV !== "production";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com ${isDev ? "'unsafe-eval'" : ""}`.trim(),
    "worker-src 'self' blob:",
    "connect-src 'self' wss://*.livekit.cloud https://*.livekit.cloud wss://meet.novicetutor.com https://accounts.google.com https://fonts.googleapis.com https://fonts.gstatic.com https://cloudflareinsights.com",
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
    "/((?!_next/static|_next/image|favicon.ico|logo.png|sw.js|mediapipe/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|apk|wasm|tflite)$).*)",
  ],
};
