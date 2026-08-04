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
 * Every Better Auth operation queries the database through the adapter
 * configured in @/lib/auth, so this must run inside withDb() the same as
 * any other DB-touching route — otherwise session lookups intermittently
 * fail with "Cannot perform I/O on behalf of a different request".
 *
 * @module api/auth/[...all]
 */

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { withDb } from "@/lib/db";

const handlers = toNextJsHandler(auth);

export const GET = (request: Request) => withDb(() => handlers.GET(request));
export const POST = (request: Request) => withDb(() => handlers.POST(request));
