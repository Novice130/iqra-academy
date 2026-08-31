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
import { twoFactor } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "@/db/schema";
import { sendTwoFactorEmail } from "./email";

/**
 * Better Auth server instance.
 */
export const auth = betterAuth({
  /**
   * Secret used to sign session tokens and cookies.
   */
  secret: process.env.BETTER_AUTH_SECRET!,

  /**
   * Base URL of the application. Used for redirect URLs after login/signup.
   */
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com",
  trustedOrigins: [
    "https://novicetutor.com",
    "https://www.novicetutor.com",
    "https://app.novicetutor.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",") : []),
  ],

  /**
   * Database adapter — explicit table mapping for Better Auth using request-scoped db.
   */
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.authSessions,
      account: schema.accounts,
      verification: schema.verifications,
      twoFactor: schema.twoFactors,
    },
  }),

  /**
   * Two-Factor Authentication Plugin (Google Authenticator TOTP & Email OTP)
   */
  plugins: [
    twoFactor({
      issuer: "Novice Tutor",
      otpOptions: {
        sendOTP: async ({ user, otp }) => {
          await sendTwoFactorEmail(user.email, otp);
        },
      },
    }),
  ],

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
   */
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
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

  /**
   * Rate limiting for auth endpoints. Slows brute-force against
   * sign-in/sign-up and the password flows. The default storage is memory —
   * per-isolate — which is the right fit for Workers: the edge already
   * spreads requests across isolates, and a DB-backed counter would add a
   * write per login for every student.
   *
   * Sign-in/sign-up get a much tighter built-in rule (3 per 10s) applied by
   * Better Auth itself; these numbers are the general ceiling.
   */
  rateLimit: {
    enabled: true,
    window: 60, // seconds
    max: 30, // requests per window per IP
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/request-password-reset": { window: 60, max: 5 },
      "/reset-password": { window: 60, max: 10 },
    },
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
