/**
 * @fileoverview Better Auth Configuration
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * Authentication is the #1 thing you must NOT get wrong. Better Auth handles:
 * - Password hashing (bcrypt) — never store plaintext passwords
 * - Session management — secure cookies, CSRF protection
 * - Email verification — prevents fake accounts
 * - RBAC — role-based access control on the server side
 *
 * WHY BETTER AUTH OVER NEXTAUTH?
 * Better Auth is designed for server-side-first applications (like ours).
 * It stores sessions in your own database (Drizzle), gives you full control
 * over the auth flow, and supports multi-tenant patterns natively.
 *
 * SECURITY PRINCIPLE: "Never trust the client."
 * All role checks happen on the server. The client can say "I'm an admin,"
 * but we verify the session on every API request. 
 *
 * @module lib/auth
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "@/db/schema";

/**
 * Better Auth server instance.
 *
 * CONFIGURATION DECISIONS:
 * 1. `drizzleAdapter` — uses our Drizzle client with full schema
 * 2. `emailAndPassword` — primary auth method (most Quran school parents
 *    aren't tech-savvy, email+password is familiar)
 * 3. Session stored in DB — survives server restarts, supports multi-device
 *
 * FUTURE ADDITIONS:
 * - Google OAuth (many users have Gmail)
 * - Magic link login (passwordless)
 * - 2FA for admins
 *
 * FAILURE MODES:
 * - If DB is down: auth fails (users can't log in) — acceptable tradeoff
 *   vs. Redis which is another service to manage
 * - If BETTER_AUTH_SECRET is missing: auth won't initialize (app crashes on start)
 */
export const auth = betterAuth({
  /**
   * Secret used to sign session tokens and cookies.
   * MUST be a long, random string. In production, this comes from env vars.
   * If compromised, an attacker could forge sessions (very bad).
   */
  secret: process.env.BETTER_AUTH_SECRET!,

  /**
   * Base URL of the application. Used for redirect URLs after login/signup.
   */
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",

  /**
   * Database adapter — explicit table mapping for Better Auth.
   * Maps Better Auth's internal table names to our Drizzle tables.
   * Note: `session` maps to `authSessions` (not `sessions` which is for classes!)
   */
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.authSessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  /**
   * Email + password authentication.
   * Email verification disabled for now (until Resend domain is verified).
   */
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  /**
   * Social/OAuth providers.
   *
   * 📚 GOOGLE SIGN-IN SETUP:
   * 1. Go to https://console.cloud.google.com/apis/credentials
   * 2. Create OAuth 2.0 Client ID (Web application)
   * 3. Add authorized redirect URI:
   *    - Dev:  http://localhost:3000/api/auth/callback/google
   *    - Prod: https://yourdomain.com/api/auth/callback/google
   * 4. Copy Client ID + Client Secret to .env
   *
   * WHY GOOGLE?
   * Many Quran school parents use Gmail. Google Sign-In skips the
   * "create password → verify email" friction, boosting signup conversion.
   */
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  /**
   * Session configuration.
   * `expiresIn` — session lasts 7 days (parents don't want to log in daily)
   * `updateAge` — refresh the session expiry if they visit within 1 day
   */
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
    updateAge: 60 * 60 * 24, // Refresh after 1 day
  },
});

/**
 * Auth session type — exported for use in API routes and middleware.
 *
 * USAGE:
 * ```ts
 * import { auth } from "@/lib/auth";
 * const session = await auth.api.getSession({ headers: request.headers });
 * if (!session) return new Response("Unauthorized", { status: 401 });
 * ```
 */
export type Session = typeof auth.$Infer.Session;
