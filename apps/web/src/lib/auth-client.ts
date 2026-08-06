/**
 * @fileoverview Better Auth Client
 *
 * Client-side auth helper used for social sign-in (Google),
 * session management, and sign-out from React components.
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
});
