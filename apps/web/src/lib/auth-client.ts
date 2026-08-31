/**
 * @fileoverview Better Auth Client
 *
 * Client-side auth helper used for social sign-in (Google),
 * session management, and sign-out from React components.
 */

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        if (typeof window !== "undefined") {
          window.location.href = "/login?twoFactor=true";
        }
      },
    }),
  ],
});
