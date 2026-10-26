/**
 * @fileoverview /admin/audit — who did what, when, from where.
 *
 * Reads audit_logs fifty rows at a time, newest first. Every filter lives in
 * the URL (action, actor, target, from, to, page), so a filtered view can be
 * linked to and the form works without JavaScript.
 *
 * Paging is by offset and fetches one row past the page to know whether an
 * older page exists, instead of counting the whole filtered table on every
 * view. Targets are resolved to their class, student or user with one
 * batched lookup per page (lib/admin-ops resolveAuditTargets).
 */

import Link from "next/link";
import { and, desc, eq, gte, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { auditActionEnum, auditLogs, users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { zonedWallClockToInstant } from "@/lib/slots";
import { resolveAuditTargets } from "@/lib/admin-ops";
import { EmptyState, PageHeader, Panel, btn } from "../_components/ui";
import AuditFilters, { type AuditFilterValues } from "./AuditFilters";
import AuditTable, { type AuditRow } from "./AuditTable";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const ACTIONS = auditActionEnum.enumValues;
type Action = (typeof ACTIONS)[number];

type SearchParams = Record<string, string | string[] | undefined>;

function param(sp: SearchParams, key: string, maxLen: number): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, maxLen);
}

/** A YYYY-MM-DD from a date input, or "" when it is anything else. */
function dateParam(sp: SearchParams, key: string): string {
  const v = param(sp, key, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

/** Midnight at the start of `ymd` (plus `addDays`) on the viewer's wall clock. */
function dayStart(ymd: string, zone: string, addDays = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return zonedWallClockToInstant(y, m, d + addDays, 0, 0, zone);
}

/** LIKE treats % and _ as wildcards; a search for "user_1" should mean that. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/audit");
    const sp = await searchParams;

    const rawAction = param(sp, "action", 40);
    const values: AuditFilterValues = {
      action: (ACTIONS as readonly string[]).includes(rawAction) ? rawAction : "",
      actor: param(sp, "actor", 100),
      target: param(sp, "target", 200),
      from: dateParam(sp, "from"),
      to: dateParam(sp, "to"),
    };
    const page = Math.max(1, Math.min(10_000, Number.parseInt(param(sp, "page", 6), 10) || 1));

    // The device zone is only known in the browser; without an account or
    // Cloudflare zone the server reads dates as UTC, and the form says so.
    const viewerZone = (await resolveViewerZone(admin.timezone)).timeZone;
    const zone = viewerZone ?? "UTC";

    const conditions: (SQL | undefined)[] = [orgFilter(admin, auditLogs.orgId)];
    if (values.action) conditions.push(eq(auditLogs.action, values.action as Action));
    if (values.target) conditions.push(ilike(auditLogs.target, `%${likeEscape(values.target)}%`));
    if (values.from) conditions.push(gte(auditLogs.createdAt, dayStart(values.from, zone)));
    if (values.to) conditions.push(lt(auditLogs.createdAt, dayStart(values.to, zone, 1)));
    if (values.actor) {
      const pattern = `%${likeEscape(values.actor)}%`;
      const matching = db
        .select({ id: users.id })
        .from(users)
        .where(and(or(ilike(users.name, pattern), ilike(users.email, pattern)), orgFilter(admin, users.orgId)));
      conditions.push(inArray(auditLogs.actorId, matching));
    }

    const fetched = await db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        action: auditLogs.action,
        target: auditLogs.target,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        actorId: auditLogs.actorId,
        actorName: users.name,
        actorEmail: users.email,
        actorRole: users.role,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);

    const hasOlder = fetched.length > PAGE_SIZE;
    const rows: AuditRow[] = fetched.slice(0, PAGE_SIZE).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    const links = await resolveAuditTargets({ orgId: admin.orgId, role: admin.role }, rows.map((r) => r.target));

    const active = Object.values(values).some(Boolean);
    const pageHref = (n: number) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(values)) if (v) q.set(k, v);
      if (n > 1) q.set("page", String(n));
      const s = q.toString();
      return s ? `/admin/audit?${s}` : "/admin/audit";
    };
    const first = (page - 1) * PAGE_SIZE + 1;

    return (
      <>
        <PageHeader
          title="Audit log"
          description={admin.isSuperAdmin ? "Every recorded action, across all organisations." : "Every recorded action in your organisation."}
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Audit log" }]}
        />

        <Panel>
          <AuditFilters values={values} actions={ACTIONS} zoneLabel={viewerZone ?? "UTC (set your timezone in Settings to use yours)"} active={active} />
        </Panel>

        <Panel
          title={rows.length > 0 ? `Entries ${first}–${first + rows.length - 1}` : "Entries"}
          description="Newest first"
          flush={rows.length > 0}
        >
          {rows.length === 0 ? (
            <EmptyState
              title={page > 1 ? "No entries on this page" : active ? "No entries match these filters" : "No audit entries yet"}
              body={active ? "Try a wider date range or fewer filters." : "Admin actions such as role changes, refunds and cancellations appear here."}
              action={active || page > 1 ? <Link href="/admin/audit" className={btn.secondary}>Clear filters</Link> : undefined}
            />
          ) : (
            <AuditTable rows={rows} links={links} />
          )}
        </Panel>

        {(page > 1 || hasOlder) && (
          <nav aria-label="Audit log pages" className="flex items-center justify-between gap-2">
            {page > 1 ? <Link href={pageHref(page - 1)} className={btn.secondary} rel="prev">Newer</Link> : <span />}
            <span className="text-xs text-[var(--text-secondary)]">Page {page}</span>
            {hasOlder ? <Link href={pageHref(page + 1)} className={btn.secondary} rel="next">Older</Link> : <span />}
          </nav>
        )}
      </>
    );
  });
}
