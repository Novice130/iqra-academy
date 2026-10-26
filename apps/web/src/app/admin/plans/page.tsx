/**
 * @fileoverview /admin/plans — the plans a family can be on, and which
 * family is on which.
 *
 * Query params (all optional):
 *   userId  a family's user id: preselects them in "Assign a plan" and
 *           filters the subscriptions list to them (removable chip)
 *   planId  filters the subscriptions list to one plan
 *   status  live (default: everything not cancelled) | ACTIVE | PAUSED |
 *           PAST_DUE | CANCELLED | all
 *   page    zero-based page of 25
 *
 * Subscriptions here are manual — the school invoices by hand — and are
 * written through api/admin/subscriptions. Stripe-managed rows are listed
 * read-only. Loading the page first ends any manual subscription whose
 * cancel-at-period-end date has passed (lib/admin-subscriptions.ts), so the
 * list never shows one as ACTIVE after it should have stopped.
 */

import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import {
  SUBS_PAGE_SIZE,
  SUB_FILTERS,
  loadFamilyOptions,
  loadPlans,
  loadSubscriptionCounts,
  loadSubscriptionPage,
  settleLapsedCancellations,
  type SubFilter,
} from "@/lib/admin-subscriptions";
import { Badge, PageHeader, Panel, StatCard, StatGrid, btn, humanize } from "../_components/ui";
import PlansPanel from "./PlansPanel";
import AssignPlanForm from "./AssignPlanForm";
import SubscriptionsTable from "./SubscriptionsTable";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<Params> }) {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/plans");
    const sp = await searchParams;

    const statusParam = one(sp.status) ?? "live";
    const filter: SubFilter = (SUB_FILTERS as readonly string[]).includes(statusParam) ? (statusParam as SubFilter) : "live";
    const page = Math.max(0, Math.floor(Number(one(sp.page) ?? 0)) || 0);
    const userParam = one(sp.userId) ?? "";
    const planParam = one(sp.planId) ?? "";

    await settleLapsedCancellations(db, admin.isSuperAdmin ? null : admin.orgId);

    const [plans, families, counts, family] = await Promise.all([
      loadPlans(admin),
      loadFamilyOptions(admin),
      loadSubscriptionCounts(admin),
      userParam
        ? db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(and(eq(users.id, userParam), orgFilter(admin, users.orgId), isNull(users.deletedAt)))
            .limit(1)
            .then((r) => r[0] ?? null)
        : Promise.resolve(null),
    ]);
    const plan = planParam ? plans.find((p) => p.id === planParam) ?? null : null;

    const { rows, total } = await loadSubscriptionPage(admin, {
      filter,
      page,
      planId: plan?.id ?? (planParam ? "__none__" : undefined),
      userId: family?.id ?? (userParam ? "__none__" : undefined),
    });

    const familiesWithout = families.filter((f) => !f.currentPlan).length;
    const pages = Math.max(1, Math.ceil(total / SUBS_PAGE_SIZE));

    const href = (over: Partial<Record<"status" | "page" | "userId" | "planId", string | null>>) => {
      const q = new URLSearchParams();
      const vals = {
        status: filter === "live" ? null : filter,
        userId: family?.id ?? null,
        planId: plan?.id ?? null,
        page: null as string | null,
        ...over,
      };
      for (const [k, v] of Object.entries(vals)) if (v) q.set(k, v);
      const s = q.toString();
      return `/admin/plans${s ? `?${s}` : ""}#subscriptions`;
    };

    return (
      <div className="space-y-6">
        <PageHeader
          title="Plans"
          description="Plans on offer, which family is on which, and this week's classes against each."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Plans" }]}
          actions={<Link href="/admin/invoices" className={btn.secondary}>Invoices</Link>}
        />

        <StatGrid>
          <StatCard label="Active" value={counts.active} href="/admin/plans?status=ACTIVE#subscriptions" tone="success" />
          <StatCard label="Paused" value={counts.paused} href="/admin/plans?status=PAUSED#subscriptions" tone={counts.paused ? "warning" : "neutral"} />
          <StatCard label="Ending at period end" value={counts.ending} />
          <StatCard label="Period over" value={counts.periodOver} hint="Manual plans to extend or end" tone={counts.periodOver ? "danger" : "neutral"} />
          <StatCard label="Families without a plan" value={familiesWithout} href="#assign" />
        </StatGrid>

        <PlansPanel plans={plans} />

        <Panel id="assign" title="Assign a plan" description="Starts a manual, invoiced subscription for one family.">
          {userParam && !family && (
            <p role="alert" className="mb-3 text-sm text-[var(--color-danger)]">That family wasn&apos;t found in this school, so nothing was picked.</p>
          )}
          <AssignPlanForm families={families} plans={plans} initialUserId={family?.id ?? ""} />
        </Panel>

        <Panel
          id="subscriptions"
          title="Subscriptions"
          description={`${total} subscription${total === 1 ? "" : "s"}${filter === "live" ? " not cancelled" : filter === "all" ? "" : ` ${humanize(filter).toLowerCase()}`}.`}
          actions={
            <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
              {SUB_FILTERS.map((f) => (
                <Link
                  key={f}
                  href={href({ status: f === "live" ? null : f })}
                  aria-current={f === filter ? "page" : undefined}
                  className={`${btn.ghost} ${f === filter ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]" : ""}`}
                >
                  {f === "live" ? "Current" : f === "all" ? "All" : humanize(f)}
                </Link>
              ))}
            </nav>
          }
          flush
        >
          {(family || plan) && (
            <div className="flex flex-wrap gap-2 px-4 pt-3 sm:px-5">
              {family && (
                <Link href={href({ userId: null })} className="inline-flex" aria-label={`Remove family filter ${family.name || family.email}`}>
                  <Badge tone="info">Family: {family.name || family.email} <span aria-hidden="true">×</span></Badge>
                </Link>
              )}
              {plan && (
                <Link href={href({ planId: null })} className="inline-flex" aria-label={`Remove plan filter ${plan.name}`}>
                  <Badge tone="info">Plan: {plan.name} <span aria-hidden="true">×</span></Badge>
                </Link>
              )}
            </div>
          )}
          <SubscriptionsTable rows={rows} plans={plans} filtered={filter !== "live" || !!family || !!plan || !!userParam || !!planParam} />
          {total > SUBS_PAGE_SIZE && (
            <nav aria-label="Subscription pages" className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              <span>Page {Math.min(page, pages - 1) + 1} of {pages}</span>
              <span className="flex gap-2">
                {page > 0 ? <Link href={href({ page: String(page - 1) })} className={btn.ghost}>Previous</Link> : <span className={`${btn.ghost} opacity-50`} aria-disabled="true">Previous</span>}
                {page < pages - 1 ? <Link href={href({ page: String(page + 1) })} className={btn.ghost}>Next</Link> : <span className={`${btn.ghost} opacity-50`} aria-disabled="true">Next</span>}
              </span>
            </nav>
          )}
        </Panel>
      </div>
    );
  });
}
