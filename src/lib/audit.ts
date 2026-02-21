/**
 * @fileoverview Audit Logging System
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * Audit logs are your "security camera footage" for the application.
 * When something goes wrong (unauthorized access, disputes, bugs),
 * audit logs tell you EXACTLY what happened, who did it, and when.
 *
 * AUDIT LOG RULES:
 * 1. APPEND-ONLY: Never update or delete audit logs
 * 2. COMPREHENSIVE: Log every sensitive action
 * 3. CONTEXTUAL: Include enough metadata to understand the action
 * 4. PERFORMANT: Use async writes so logging doesn't slow down the user
 *
 * COMPLIANCE: Many organizations require audit logs for:
 * - PCI DSS (payment card industry)
 * - COPPA (children's online privacy — relevant for Quran schools!)
 * - SOC 2 (service organization controls)
 *
 * @module lib/audit
 */

import { db } from "./db";
import { auditLogs } from "@/db/schema";

/**
 * The audit action types — mirrors the pgEnum in schema.
 */
export type AuditAction =
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "ROLE_CHANGED"
  | "IMPERSONATION_START"
  | "IMPERSONATION_END"
  | "PAYMENT_RECEIVED"
  | "REFUND_ISSUED"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_CANCELLED"
  | "SESSION_CREATED"
  | "SESSION_COMPLETED"
  | "BOOKING_CREATED"
  | "BOOKING_CANCELLED"
  | "CHAT_MESSAGE_HIDDEN"
  | "COUPON_CREATED"
  | "EXPORT_GENERATED"
  | "SETTINGS_CHANGED";

/**
 * Parameters for creating an audit log entry.
 */
export interface AuditLogParams {
  /** Organization context (null for super-admin actions) */
  orgId?: string | null;
  /** Who performed the action (null for system actions like webhooks) */
  actorId?: string | null;
  /** What type of action was performed */
  action: AuditAction;
  /** What was acted upon (format: "entity:id", e.g., "user:clk2m1x0z") */
  target?: string;
  /** Additional context as JSON (e.g., changed fields, amounts) */
  metadata?: Record<string, unknown>;
  /** IP address of the actor (for security investigation) */
  ipAddress?: string;
}

/**
 * Creates an audit log entry. This function is designed to NEVER throw —
 * if logging fails, we log to console but don't crash the application.
 *
 * 📚 WHY NEVER THROW?
 * Imagine: a student successfully books a class, but the audit log DB write
 * fails (network blip). Should we roll back the booking? NO! The booking is
 * the important business action. Audit logging is secondary.
 *
 * @param params - Audit log entry parameters
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      orgId: params.orgId ?? undefined,
      actorId: params.actorId ?? undefined,
      action: params.action,
      target: params.target,
      metadata: params.metadata ?? {},
      ipAddress: params.ipAddress,
    });
  } catch (error) {
    console.error("[AUDIT] Failed to write audit log:", error, params);
  }
}

/**
 * Bulk creates audit log entries. Used for batch operations.
 *
 * @param entries - Array of audit log parameters
 */
export async function logAuditBatch(entries: AuditLogParams[]): Promise<void> {
  try {
    await db.insert(auditLogs).values(
      entries.map((params) => ({
        orgId: params.orgId ?? undefined,
        actorId: params.actorId ?? undefined,
        action: params.action,
        target: params.target,
        metadata: params.metadata ?? {},
        ipAddress: params.ipAddress,
      }))
    );
  } catch (error) {
    console.error("[AUDIT] Failed to write batch audit logs:", error);
  }
}

/**
 * Helper to extract IP address from a request.
 *
 * 📚 IP ADDRESS NOTES:
 * - `x-forwarded-for` is set by reverse proxies (Nginx, Cloudflare)
 * - It can be a comma-separated list; the first one is the client
 * - In development, it's typically "::1" (IPv6 localhost)
 * - NEVER trust IP for authentication (it can be spoofed)
 * - We log it for forensic investigation only
 *
 * @param headers - Request headers
 * @returns The client's IP address or "unknown"
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return headers.get("x-real-ip") || "unknown";
}
