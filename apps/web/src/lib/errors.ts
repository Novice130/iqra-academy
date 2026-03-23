/**
 * @fileoverview Typed Error Handling Utilities
 * @module lib/errors
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Custom application error with HTTP status code */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** 404 Not Found */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

/** 403 Forbidden */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "FORBIDDEN");
  }
}

/** 409 Conflict */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

/** 422 Business Logic Violation */
export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(message, 422, "BUSINESS_RULE_VIOLATION");
  }
}

/**
 * Handles errors from API route handlers and returns a proper JSON response.
 *
 * USAGE:
 * ```ts
 * export async function POST(request: NextRequest) {
 *   try {
 *     // ... route logic
 *   } catch (error) {
 *     return handleApiError(error);
 *   }
 * }
 * ```
 */
export function handleApiError(error: unknown): NextResponse {
  // Zod validation errors → 400
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation Error",
        details: error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
      { status: 400 }
    );
  }

  // Our custom application errors
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  // Unknown errors → 500
  console.error("[API] Unhandled error:", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
