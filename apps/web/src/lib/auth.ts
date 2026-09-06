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
   *
   * New signups MUST land in an explicit org: the users.org_id column has no
   * database default (migration 0009 dropped the seed-org default that used
   * to silently home every signup under the seed tenant). Registering without
   * one would violate NOT NULL, so the adapter stamps the default org here —
   * visibly, in code, instead of invisibly in the schema.
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
   * Uses native node:crypto scrypt to avoid @noble/hashes pure-JS 67MB memory
   * allocation spike that triggers Cloudflare Worker 1102 (exceeded resource limits).
   */
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      hash: async (password: string) => {
        const crypto = await import("node:crypto");
        const salt = crypto.randomBytes(16).toString("hex");
        return new Promise<string>((resolve, reject) => {
          crypto.scrypt(
            password.normalize("NFKC"),
            salt,
            64,
            { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 },
            (err, derivedKey) => {
              if (err) reject(err);
              else resolve(`${salt}:${derivedKey.toString("hex")}`);
            }
          );
        });
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        const [salt, key] = hash.split(":");
        if (!salt || !key) return false;
        const crypto = await import("node:crypto");
        return new Promise<boolean>((resolve) => {
          crypto.scrypt(
            password.normalize("NFKC"),
            salt,
            64,
            { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 },
            (err, derivedKey) => {
              if (err) resolve(false);
              else {
                const keyBuf = Buffer.from(key, "hex");
                if (derivedKey.length !== keyBuf.length) return resolve(false);
                resolve(crypto.timingSafeEqual(derivedKey, keyBuf));
              }
            }
          );
        });
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Single-tenant today: every self-serve signup joins the default
          // school org explicitly. Multi-org signup (invite code / subdomain)
          // replaces this lookup, not the column default — the default stays
          // dropped so a missing org always fails loudly.
          const { eq } = await import("drizzle-orm");
          const { organizations } = await import("@/db/schema");
          const existing = await db.query.users.findFirst({
            columns: { orgId: true },
          });
          let orgId = existing?.orgId;
          if (!orgId) {
            const seed = await db.query.organizations.findFirst({
              where: eq(organizations.slug, "iqra-academy"),
              columns: { id: true },
            });
            orgId = seed?.id;
          }
          if (!orgId) {
            throw new Error("No organization available for signup.");
          }
          return { data: { ...user, orgId } };
        },
      },
    },
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
