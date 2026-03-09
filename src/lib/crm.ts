/**
 * @fileoverview CRM Integration (Twenty — Open-Source CRM)
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * Twenty is an open-source CRM (like HubSpot/Salesforce but free).
 * It's built on Postgres and has a clean REST API for syncing data.
 *
 * WHY TWENTY OVER HUBSPOT?
 * - Open-source (AGPL-3.0) — no vendor lock-in
 * - Self-hostable — data stays on your infrastructure
 * - Postgres-based — same DB tech as our app
 * - Modern UI — not a 2005 enterprise app
 * - REST + GraphQL API — easy to integrate
 *
 * WHAT WE SYNC:
 * - New student signup → Create a Twenty "Person" record
 * - Subscription → Create/update a Twenty "Opportunity" record
 * - Cancellation → Update opportunity status to "Lost"
 * - Delinquency → Add a note to the person record
 *
 * SETUP:
 * 1. Self-host Twenty: docker run -d --name twenty -p 3001:3000 twentyhq/twenty
 * 2. Or use Twenty Cloud: https://app.twenty.com
 * 3. Create an API key: Settings → Integrations → API Keys
 * 4. Set TWENTY_API_URL and TWENTY_API_KEY in .env
 *
 * @module lib/crm
 */

import { db } from "./db";
import { crmSyncEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// CONFIG
// ============================================================================

const CRM_CONFIG = {
  /** Twenty CRM REST API base URL */
  baseUrl: process.env.TWENTY_API_URL || "http://localhost:3001/api",
  /** Twenty API key */
  apiKey: process.env.TWENTY_API_KEY || "",
  /** Whether CRM sync is enabled (disable in dev to avoid API calls) */
  enabled: process.env.CRM_SYNC_ENABLED === "true",
};

// ============================================================================
// TYPES
// ============================================================================

export interface CrmContactData {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  planTier: string;
  orgName: string;
  signupDate: string;
}

export interface CrmDealData {
  contactId: string;
  dealName: string;
  amount: number;
  planTier: string;
  stage: "subscriber" | "cancelled" | "delinquent";
}

// ============================================================================
// API HELPERS
// ============================================================================

/**
 * Makes an authenticated request to Twenty CRM API.
 *
 * 📚 Twenty uses Bearer token authentication.
 * API docs: https://twenty.com/developers/rest-api
 *
 * @param path - API path (e.g., "/people")
 * @param options - Fetch options
 * @returns Response data as JSON
 */
async function twentyRequest(
  path: string,
  options: RequestInit = {}
): Promise<Record<string, unknown>> {
  if (!CRM_CONFIG.enabled) {
    console.log(`[CRM] Sync disabled. Would have called: ${path}`);
    return { data: { id: "mock-id" } };
  }

  if (!CRM_CONFIG.apiKey) {
    throw new Error(
      "[CRM] TWENTY_API_KEY is not set. " +
        "Get one from Twenty → Settings → API Keys."
    );
  }

  const response = await fetch(`${CRM_CONFIG.baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRM_CONFIG.apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`[CRM] Twenty API error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

// ============================================================================
// SYNC FUNCTIONS
// ============================================================================

/**
 * Syncs a new student to Twenty CRM as a "Person" record.
 *
 * 📚 In Twenty, a "Person" = a contact/individual.
 * We create the person with their plan tier and org name as custom fields.
 *
 * @param orgId - Organization ID
 * @param userId - User ID
 * @param data - Contact data
 * @returns The Twenty person ID
 */
export async function syncContactToCRM(
  orgId: string,
  userId: string,
  data: CrmContactData
): Promise<string> {
  const [event] = await db
    .insert(crmSyncEvents)
    .values({
      orgId,
      userId,
      syncType: "CONTACT_CREATED",
      payload: data,
      success: false,
    })
    .returning();

  try {
    const result = await twentyRequest("/people", {
      method: "POST",
      body: JSON.stringify({
        name: {
          firstName: data.firstName,
          lastName: data.lastName || "",
        },
        emails: {
          primaryEmail: data.email,
        },
        phones: {
          primaryPhone: data.phone || "",
        },
        // Custom fields (create these in Twenty → Settings → Data Model)
        planTier: data.planTier,
        organization: data.orgName,
      }),
    });

    const personData = result.data as Record<string, unknown> | undefined;
    const twentyId = (personData?.id as string) || "";

    await db
      .update(crmSyncEvents)
      .set({ success: true, externalId: twentyId })
      .where(eq(crmSyncEvents.id, event.id));

    return twentyId;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown CRM error";
    await db
      .update(crmSyncEvents)
      .set({ success: false, errorMessage: errorMsg })
      .where(eq(crmSyncEvents.id, event.id));

    console.error(`[CRM] Failed to sync contact:`, errorMsg);
    return "";
  }
}

/**
 * Syncs a cancellation to Twenty CRM.
 * Updates the person's plan tier to "cancelled".
 */
export async function syncCancellationToCRM(
  orgId: string,
  userId: string,
  twentyPersonId: string,
  reason?: string
): Promise<void> {
  await db.insert(crmSyncEvents).values({
    orgId,
    userId,
    syncType: "CANCELLATION_SYNCED",
    externalId: twentyPersonId,
    payload: { reason: reason || "No reason provided" },
    success: false,
  });

  try {
    await twentyRequest(`/people/${twentyPersonId}`, {
      method: "PATCH",
      body: JSON.stringify({
        planTier: "cancelled",
      }),
    });
    console.log(`[CRM] Synced cancellation for person ${twentyPersonId}`);
  } catch (error) {
    console.error(`[CRM] Failed to sync cancellation:`, error);
  }
}

/**
 * Syncs a delinquency event to Twenty CRM.
 * Creates a note on the person's record about the overdue payment.
 */
export async function syncDelinquencyToCRM(
  orgId: string,
  userId: string,
  twentyPersonId: string,
  invoiceId: string
): Promise<void> {
  await db.insert(crmSyncEvents).values({
    orgId,
    userId,
    syncType: "DELINQUENCY_SYNCED",
    externalId: twentyPersonId,
    payload: { invoiceId },
    success: false,
  });

  try {
    // Create a note on the person record
    await twentyRequest("/notes", {
      method: "POST",
      body: JSON.stringify({
        title: `Payment Overdue — Invoice ${invoiceId}`,
        body: `This student has an overdue invoice (${invoiceId}). Follow up required.`,
        personId: twentyPersonId,
      }),
    });
    console.log(`[CRM] Synced delinquency for person ${twentyPersonId}`);
  } catch (error) {
    console.error(`[CRM] Failed to sync delinquency:`, error);
  }
}
