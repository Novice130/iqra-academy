/**
 * @fileoverview /admin/trials — every trial class and where it stands.
 *
 * There is no trial-request table: a trial is a session with origin TRIAL
 * (and the legacy isTrial mirror), booked by the family from their
 * dashboard. "Upcoming" here means what the overview's count means —
 * SCHEDULED and not started. The rest of the stage is derived; only the
 * follow-up is recorded by hand (see stages.ts and api/admin/trials).
 */

import Link from "next/link";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import { loadTrialPipeline } from "@/lib/admin-students";
import { PageHeader, Panel, StatCard, StatGrid, btn } from "../_components/ui";
import TrialsTable from "./TrialsTable";

export const dynamic = "force-dynamic";

export default async function AdminTrialsPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/trials");
    const { rows, truncated } = await loadTrialPipeline(admin);

    const count = (stage: string) => rows.filter((r) => r.stage === stage).length;
    const finished = rows.filter((r) => r.stage !== "UPCOMING" && r.stage !== "IN_CLASS" && r.stage !== "CANCELLED");
    const converted = count("CONVERTED");
    const rate = finished.length ? Math.round((converted / finished.length) * 100) : null;
    const awaiting = count("ATTENDED");
    const noOutcome = count("NEEDS_OUTCOME");

    return (
      <div className="space-y-6">
        <PageHeader
          title="Trial classes"
          description="Free first classes, from booking through to a paying family."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Trials" }]}
          actions={<Link href="/admin/assign-student" className={btn.primary}>Book a class</Link>}
        />

        <StatGrid>
          <StatCard label="Upcoming" value={count("UPCOMING")} />
          <StatCard label="Attended, not converted" value={awaiting} hint="Follow these up" tone={awaiting ? "warning" : "neutral"} />
          <StatCard label="Needs outcome" value={noOutcome} hint="Past, unmarked, nobody joined" tone={noOutcome ? "warning" : "neutral"} />
          <StatCard label="Converted" value={converted} tone="success" />
          <StatCard
            label="Conversion rate"
            value={rate === null ? "—" : `${rate}%`}
            hint="Of trials that have happened, excluding cancelled"
          />
        </StatGrid>

        {truncated && (
          <p role="status" className="text-sm text-[var(--text-secondary)]">
            Showing the most recent {rows.length} trials. Older ones are in the classes list and exports.
          </p>
        )}

        <Panel flush>
          <TrialsTable rows={rows} />
        </Panel>
      </div>
    );
  });
}
