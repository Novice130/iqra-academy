"use client";

/**
 * @fileoverview The plans table on /admin/plans, with create and inline edit.
 * After a save it refreshes the server render rather than patching rows, so
 * the subscription counts stay the database's.
 */

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "@/lib/money";
import type { PlanRow } from "@/lib/admin-subscriptions";
import { Badge, EmptyState, Panel, btn, humanize, table } from "../_components/ui";
import PlanForm from "./PlanForm";
import { TIER_HINT, noticeClass } from "./shared";

export default function PlansPanel({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function done(text: string) {
    setEditing(null);
    setNotice(text);
    startRefresh(() => router.refresh());
  }

  return (
    <Panel
      title="Plans"
      description="What a family can be put on. Retired plans stay on the families already using them."
      actions={
        editing !== "new" && (
          <button type="button" className={btn.secondary} onClick={() => { setNotice(null); setEditing("new"); }}>
            New plan
          </button>
        )
      }
      flush
    >
      {notice && (
        <div className="px-4 pt-3 sm:px-5">
          <p role="status" className={noticeClass(false)}>{notice}{refreshing ? " Updating…" : ""}</p>
        </div>
      )}
      {editing === "new" && (
        <div className="p-4 sm:p-5 border-b border-[var(--border)]">
          <PlanForm onDone={done} onCancel={() => setEditing(null)} />
        </div>
      )}
      {plans.length === 0 ? (
        <EmptyState title="No plans yet" body="Create a plan before assigning one to a family." />
      ) : (
        <div className={table.wrap}>
          <table className={`${table.table} min-w-[720px]`}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>Plan</th>
                <th scope="col" className={table.th}>Tier</th>
                <th scope="col" className={`${table.th} text-right`}>Price</th>
                <th scope="col" className={`${table.th} text-right`}>Classes / week</th>
                <th scope="col" className={`${table.th} text-right`}>Students</th>
                <th scope="col" className={`${table.th} text-right`}>Active families</th>
                <th scope="col" className={table.th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <Fragment key={p.id}>
                  <tr className={table.tr}>
                    <td className={table.td}>
                      <div className="font-semibold">{p.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        {!p.isActive && <Badge>Retired</Badge>}
                        {p.stripeLinked && <Badge tone="info">Stripe price</Badge>}
                      </div>
                    </td>
                    <td className={table.td}>
                      <div>{humanize(p.tier)}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">{TIER_HINT[p.tier]}</div>
                    </td>
                    <td className={`${table.td} text-right tabular-nums`}>{money(p.priceInCents, p.currency)}</td>
                    <td className={`${table.td} text-right tabular-nums`}>{p.classesPerWeek}</td>
                    <td className={`${table.td} text-right tabular-nums`}>{p.maxStudents}</td>
                    <td className={`${table.td} text-right tabular-nums`}>
                      <Link href={`/admin/plans?planId=${encodeURIComponent(p.id)}#subscriptions`} className="underline-offset-2 hover:underline hover:text-[var(--accent)]">
                        {p.activeCount}
                      </Link>
                      {p.liveCount > p.activeCount && (
                        <div className="text-xs text-[var(--text-tertiary)]">+{p.liveCount - p.activeCount} paused or unpaid</div>
                      )}
                    </td>
                    <td className={`${table.td} text-right`}>
                      <button
                        type="button"
                        className={btn.ghost}
                        aria-expanded={editing === p.id}
                        onClick={() => { setNotice(null); setEditing(editing === p.id ? null : p.id); }}
                      >
                        {editing === p.id ? "Close" : "Edit"}
                      </button>
                    </td>
                  </tr>
                  {editing === p.id && (
                    <tr className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/40">
                      <td colSpan={7} className="px-4 py-4">
                        <PlanForm plan={p} onDone={done} onCancel={() => setEditing(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
