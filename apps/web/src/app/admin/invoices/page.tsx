/**
 * @fileoverview /admin/invoices — raise invoices, record payments and refunds.
 *
 * Query params (all optional):
 *   userId  a family's user id: opens "Issue invoice" with that family picked
 *   status  OPEN | OVERDUE | PAID | VOID | DRAFT | UNCOLLECTIBLE
 *   q       family name or email, substring
 *   from/to YYYY-MM-DD issue-date range, inclusive, in the viewer's zone
 *   tz      the browser's zone, sent by the filter form; used only when the
 *           server doesn't already know the viewer's zone
 *
 * The filters run here, in SQL, so the stat cards always describe the whole
 * ledger while the table shows the filtered slice. "Overdue" is computed —
 * OPEN with its due date passed — since nothing flips the stored status.
 */

import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { invoices, plans, studentProfiles, subscriptions, users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { zonedDayParts, zonedWallClockToInstant } from "@/lib/slots";
import { isValidZone } from "@/lib/zones";
import { money } from "@/lib/money";
import { PageHeader, StatCard, StatGrid, btn } from "../_components/ui";
import InvoiceDesk from "./InvoiceDesk";
import InvoiceFilters from "./InvoiceFilters";
import { STATUS_FILTERS, shiftDayKey, type FamilyOption, type InvoiceRow, type StatusFilter } from "./shared";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 300;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function dayStart(key: string, zone: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return zonedWallClockToInstant(y, m, d, 0, 0, zone);
}

/** "$120.00", or "$120.00 + £40.00" when the ledger holds more than one currency. */
function sumByCurrency(rows: { currency: string; cents: number }[]): string {
  const nonZero = rows.filter((r) => r.cents !== 0);
  if (nonZero.length === 0) return money(0, rows[0]?.currency ?? "usd");
  return nonZero.map((r) => money(r.cents, r.currency)).join(" + ");
}

export default async function AdminInvoicesPage({ searchParams }: { searchParams: Promise<Params> }) {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/invoices");
    const sp = await searchParams;

    const tzParam = one(sp.tz);
    const zone =
      (await resolveViewerZone(admin.timezone)).timeZone ??
      (tzParam && isValidZone(tzParam) ? tzParam : "UTC");

    const statusParam = one(sp.status)?.toUpperCase();
    const status = STATUS_FILTERS.includes(statusParam as StatusFilter) ? (statusParam as StatusFilter) : "";
    const q = (one(sp.q) ?? "").trim().slice(0, 100);
    const from = DAY.test(one(sp.from) ?? "") ? one(sp.from)! : "";
    const to = DAY.test(one(sp.to) ?? "") ? one(sp.to)! : "";
    const prefillParam = one(sp.userId) ?? "";

    const now = new Date();
    const pastDue = and(eq(invoices.status, "OPEN"), lt(invoices.dueDate, now));
    const overdueCond = or(eq(invoices.status, "OVERDUE"), pastDue);
    const today = zonedDayParts(now, zone);
    const monthStart = zonedWallClockToInstant(today.y, today.m, 1, 0, 0, zone);
    const scope = orgFilter(admin, invoices.orgId);

    const filters: (SQL | undefined)[] = [scope];
    if (status === "OVERDUE") filters.push(overdueCond);
    else if (status === "OPEN")
      filters.push(and(eq(invoices.status, "OPEN"), or(isNull(invoices.dueDate), gte(invoices.dueDate, now))));
    else if (status) filters.push(eq(invoices.status, status));
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(or(ilike(users.name, pattern), ilike(users.email, pattern)));
    }
    if (from) filters.push(gte(invoices.createdAt, dayStart(from, zone)));
    if (to) filters.push(lt(invoices.createdAt, dayStart(shiftDayKey(to, 1), zone)));

    const [statRows, familyRows, rows] = await Promise.all([
      db
        .select({
          currency: invoices.currency,
          openCents: sql<number>`coalesce(sum(${invoices.amountDueCents} - ${invoices.amountPaidCents}) filter (where ${inArray(invoices.status, ["OPEN", "OVERDUE"])}), 0)::int`,
          openCount: sql<number>`(count(*) filter (where ${inArray(invoices.status, ["OPEN", "OVERDUE"])}))::int`,
          overdueCents: sql<number>`coalesce(sum(${invoices.amountDueCents} - ${invoices.amountPaidCents}) filter (where ${overdueCond}), 0)::int`,
          overdueCount: sql<number>`(count(*) filter (where ${overdueCond}))::int`,
          paidMonthCents: sql<number>`coalesce(sum(${invoices.amountPaidCents}) filter (where ${and(eq(invoices.status, "PAID"), gte(invoices.paidAt, monthStart))}), 0)::int`,
          voidCount: sql<number>`(count(*) filter (where ${eq(invoices.status, "VOID")}))::int`,
        })
        .from(invoices)
        .where(scope)
        .groupBy(invoices.currency),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          planName: plans.name,
          priceInCents: plans.priceInCents,
          currency: plans.currency,
        })
        .from(users)
        .leftJoin(
          subscriptions,
          and(eq(subscriptions.userId, users.id), inArray(subscriptions.status, ["ACTIVE", "PAST_DUE", "UNPAID"]))
        )
        .leftJoin(plans, eq(plans.id, subscriptions.planId))
        .where(and(orgFilter(admin, users.orgId), eq(users.role, "STUDENT"), isNull(users.deletedAt)))
        .orderBy(asc(users.name)),
      db
        .select({
          id: invoices.id,
          userId: invoices.userId,
          userName: users.name,
          userEmail: users.email,
          status: invoices.status,
          amountDueCents: invoices.amountDueCents,
          amountPaidCents: invoices.amountPaidCents,
          currency: invoices.currency,
          notes: invoices.notes,
          stripeInvoiceId: invoices.stripeInvoiceId,
          dueDate: invoices.dueDate,
          paidAt: invoices.paidAt,
          periodStart: invoices.periodStart,
          periodEnd: invoices.periodEnd,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .innerJoin(users, eq(users.id, invoices.userId))
        .where(and(...filters))
        .orderBy(desc(invoices.createdAt))
        .limit(LIST_LIMIT),
    ]);

    // First-created profile per family, for the student 360 link.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const profiles = userIds.length
      ? await db
          .select({ id: studentProfiles.id, userId: studentProfiles.userId })
          .from(studentProfiles)
          .where(inArray(studentProfiles.userId, userIds))
          .orderBy(asc(studentProfiles.createdAt))
      : [];
    const profileOf = new Map<string, string>();
    for (const p of profiles) if (!profileOf.has(p.userId)) profileOf.set(p.userId, p.id);

    const seen = new Set<string>();
    const families: FamilyOption[] = [];
    for (const f of familyRows) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      families.push({ ...f, currency: f.currency ?? "usd" });
    }

    const initial: InvoiceRow[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      profileId: profileOf.get(r.userId) ?? null,
      status: r.status,
      overdue: r.status === "OVERDUE" || (r.status === "OPEN" && !!r.dueDate && r.dueDate < now),
      amountDueCents: r.amountDueCents,
      amountPaidCents: r.amountPaidCents,
      currency: r.currency,
      notes: r.notes,
      manual: r.stripeInvoiceId === null,
      dueDate: r.dueDate?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      periodStart: r.periodStart?.toISOString() ?? null,
      periodEnd: r.periodEnd?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    const pick = (k: "openCents" | "overdueCents" | "paidMonthCents") =>
      sumByCurrency(statRows.map((s) => ({ currency: s.currency, cents: s[k] })));
    const count = (k: "openCount" | "overdueCount" | "voidCount") => statRows.reduce((n, s) => n + s[k], 0);
    const overdueCount = count("overdueCount");
    const prefillUserId = families.some((f) => f.id === prefillParam) ? prefillParam : "";

    return (
      <div className="space-y-6">
        <PageHeader
          title="Invoices"
          description="Raise invoices, record bank and Zelle payments, void mistakes and record refunds."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Invoices" }]}
          actions={
            <Link href="/admin/exports" className={btn.secondary}>
              Export CSV
            </Link>
          }
        />

        <StatGrid>
          <StatCard label="Open balance" value={pick("openCents")} hint={`${count("openCount")} open invoices`} href="/admin/invoices?status=OPEN" />
          <StatCard
            label="Overdue"
            value={overdueCount}
            hint={`${pick("overdueCents")} unpaid past due`}
            tone={overdueCount > 0 ? "danger" : "neutral"}
            href="/admin/invoices?status=OVERDUE"
          />
          <StatCard label="Paid this month" value={pick("paidMonthCents")} tone="success" href="/admin/invoices?status=PAID" />
          <StatCard label="Voided" value={count("voidCount")} href="/admin/invoices?status=VOID" />
        </StatGrid>

        <InvoiceFilters status={status} q={q} from={from} to={to} />

        <InvoiceDesk
          families={families}
          invoices={initial}
          prefillUserId={prefillUserId}
          prefillMissing={!!prefillParam && !prefillUserId}
          limitHit={rows.length === LIST_LIMIT}
          filtered={!!(status || q || from || to)}
        />
      </div>
    );
  });
}
