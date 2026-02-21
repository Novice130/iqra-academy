/**
 * @fileoverview Better Auth API Route Handler
 *
 * This is the catch-all route that Better Auth uses to handle all
 * authentication endpoints: signup, login, logout, email verification,
 * password reset, session management, etc.
 *
 * Better Auth registers routes like:
 * - POST /api/auth/sign-up
 * - POST /api/auth/sign-in
 * - GET  /api/auth/session
 * - POST /api/auth/sign-out
 * - POST /api/auth/forgot-password
 *
 * The [...all] catch-all route pattern maps ALL of these to this handler.
 *
 * @module api/auth/[...all]
 */

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Export GET and POST handlers that delegate to Better Auth.
 * Better Auth inspects the URL path to determine which auth action to perform.
 */
export const { GET, POST } = toNextJsHandler(auth);
