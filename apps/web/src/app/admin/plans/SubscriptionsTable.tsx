"use client";

/**
 * @fileoverview One page of subscriptions. Manual rows open a Manage drawer;
 * Stripe rows are read-only and point to Stripe, because the webhook would
 * overwrite anything changed here.
 */

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlanRow, SubscriptionRow } from "@/lib/admin-subscriptions";
import { Badge, EmptyState, StatusBadge, btn, humanize, table } from "../_components/ui";
import ShortDate from "../students/ShortDate";
import SubscriptionActions from "./SubscriptionActions";
import { noticeClass } from "./shared";

function Usage({ u }: { u: SubscriptionRow["usage"] }) {
  if (!u) return <span className="text-[var(--text-tertiary)]">Can&apos;t book</span>;
  const left = Math.max(0, u.allowed - u.used);
  return (
    <div>
      <div className="tabular-nums">{u.used} of {u.allowed} used</div>
      <div className={`text-xs ${left === 0 ? "text-[var(--color-warning)]" : "text-[var(--text-tertiary)]"}`}>
        {left} left{u.perChild ? `, ${u.children} child${u.children === 1 ? "" : "ren"}` : ""}
      </div>
    </div>
  );
}

export default function SubscriptionsTable({
  rows,
  plans,
  filtered,
}: {
  rows: SubscriptionRow[];
  plans: PlanRow[];
  filtered: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function done(text: string) {
    setNotice(text);
    setOpen(null);
    startRefresh(() => router.refresh());
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={filtered ? "No subscriptions match" : "No subscriptions yet"}
        body={filtered ? "Try another status, or clear the filters." : "Assign a plan to a family above to start one."}
      />
    );
  }

  return (
    <>
      {notice && (
        <div className="px-4 pt-3 sm:px-5">
          <p role="status" className={noticeClass(false)}>{notice}{refreshing ? " Updating…" : ""}</p>
        </div>
      )}
      <div className={table.wrap}>
        <table className={`${table.table} min-w-[880px]`}>
          <thead>
            <tr>
              <th scope="col" className={table.th}>Family</th>
              <th scope="col" className={table.th}>Plan</th>
              <th scope="col" className={table.th}>Status</th>
              <th scope="col" className={table.th}>Period</th>
              <th scope="col" className={table.th}>Payment</th>
              <th scope="col" className={table.th}>This week</th>
              <th scope="col" className={table.th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const live = r.status !== "CANCELLED";
              const who = r.familyName || r.familyEmail;
              return (
                <Fragment key={r.id}>
                  <tr className={table.tr}>
                    <td className={table.td}>
                      {r.profileId ? (
                        <Link href={`/admin/students/${r.profileId}`} className="font-semibold hover:text-[var(--accent)] hover:underline">{who}</Link>
                      ) : (
                        <span className="font-semibold">{who}</span>
                      )}
                      <div className="text-xs text-[var(--text-tertiary)] break-all">{r.familyEmail}</div>
                    </td>
                    <td className={table.td}>
                      <div>{r.planName}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">{humanize(r.tier)}</div>
                    </td>
                    <td className={table.td}>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={r.status} />
                        {r.cancelAtPeriodEnd && <Badge tone="warning">Ends at period end</Badge>}
                        {r.periodOver && <Badge tone="danger">Period over</Badge>}
                      </div>
                    </td>
                    <td className={`${table.td} whitespace-nowrap`}>
                      <ShortDate iso={r.periodStart} /> <span aria-hidden="true">–</span><span className="sr-only">to</span> <ShortDate iso={r.periodEnd} />
                    </td>
                    <td className={table.td}>
                      <div>{humanize(r.paymentMethod)}</div>
                      {r.stripeSubscriptionId && <div className="text-xs text-[var(--text-tertiary)]">Stripe</div>}
                    </td>
                    <td className={table.td}><Usage u={r.usage} /></td>
                    <td className={`${table.td} text-right whitespace-nowrap`}>
                      {r.stripeSubscriptionId ? (
                        <a
                          href={`https://dashboard.stripe.com/subscriptions/${encodeURIComponent(r.stripeSubscriptionId)}`}
                          target="_blank"
                          rel="noreferrer"
                          className={btn.ghost}
                        >
                          Manage in Stripe
                        </a>
                      ) : live ? (
                        <button
                          type="button"
                          className={btn.ghost}
                          aria-expanded={open === r.id}
                          onClick={() => { setNotice(null); setOpen(open === r.id ? null : r.id); }}
                        >
                          {open === r.id ? "Close" : "Manage"}
                        </button>
                      ) : (
                        <Link href={`/admin/plans?userId=${encodeURIComponent(r.userId)}#assign`} className={btn.ghost}>
                          New plan
                        </Link>
                      )}
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/40">
                      <td colSpan={7} className="px-4 py-4">
                        <SubscriptionActions row={r} plans={plans} onDone={done} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
