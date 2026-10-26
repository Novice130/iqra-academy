/**
 * @fileoverview Account panels on the student 360: the family login, its
 * billing, observers, and progress/feedback. Server components.
 *
 * Billing belongs to the family account, not the child: one invoice covers
 * every sibling on it, so this panel shows the same thing on each sibling's page.
 */

import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import { money } from "@/lib/money";
import type { Student360 } from "@/lib/admin-students";
import { Badge, DefinitionList, EmptyState, Panel, StatusBadge, btn, humanize, table } from "../../_components/ui";
import ShortDate from "../ShortDate";

export function FamilyPanel({ data }: { data: Student360 }) {
  const f = data.family;
  return (
    <Panel title="Family account" description="The login that books and pays for this student.">
      <DefinitionList
        items={[
          { term: "Parent", value: f.deleted ? <>{f.name} <Badge tone="danger">Account deleted</Badge></> : f.name },
          { term: "Email", value: <a href={`mailto:${f.email}`} className="hover:text-[var(--accent)] hover:underline">{f.email}</a> },
          { term: "Phone", value: f.phone ? <a href={`tel:${f.phone}`} className="hover:text-[var(--accent)] hover:underline">{f.phone}</a> : "Not given" },
          { term: "Account created", value: <ShortDate iso={f.createdAt} /> },
        ]}
      />
      <div className="mt-4">
        <div className="text-xs font-medium text-[var(--text-tertiary)]">Other children on this account</div>
        {data.siblings.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">None.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {data.siblings.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/students/${s.id}`} className={btn.secondary}>
                  {s.name} <span className="text-xs font-normal text-[var(--text-secondary)]">{humanize(s.track)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export function BillingPanel({ data }: { data: Student360 }) {
  const b = data.billing;
  const invoicesHref = `/admin/invoices?userId=${encodeURIComponent(data.family.id)}`;
  // /admin/plans preselects this family in "Assign a plan" and filters its
  // subscription list to them, where change/pause/cancel live.
  const planHref = `/admin/plans?userId=${encodeURIComponent(data.family.id)}`;
  const hasLivePlan = !!data.subscription && data.subscription.status !== "CANCELLED";
  return (
    <Panel
      title="Billing"
      description="Invoices and plan for the family account."
      actions={
        <>
          <Link href={`${planHref}${hasLivePlan ? "#subscriptions" : "#assign"}`} className={btn.ghost}>
            {hasLivePlan ? "Manage plan" : "Assign plan"}
          </Link>
          <Link href={invoicesHref} className={btn.ghost}>All invoices</Link>
        </>
      }
    >
      <DefinitionList
        items={[
          {
            term: "Plan",
            value: data.subscription ? (
              <>
                {data.subscription.planName} <StatusBadge status={data.subscription.status} />
                {data.subscription.cancelAtPeriodEnd && <span className="ml-1"><Badge tone="warning">Ends at period end</Badge></span>}
              </>
            ) : (
              "No subscription"
            ),
          },
          {
            term: "This week's classes",
            value: data.quota
              ? `${data.quota.used} of ${data.quota.totalAllowed} used, ${data.quota.remaining} left`
              : "No active plan",
          },
          {
            term: "Outstanding",
            value:
              b.unpaidCount === 0
                ? "Nothing owed"
                : b.outstandingCurrency
                  ? `${money(b.outstandingCents, b.outstandingCurrency)} across ${b.unpaidCount} invoice${b.unpaidCount === 1 ? "" : "s"}`
                  : `${b.unpaidCount} unpaid invoices in more than one currency`,
          },
          {
            term: "Period ends",
            value: data.subscription ? <ShortDate iso={data.subscription.currentPeriodEnd} /> : "—",
          },
        ]}
      />
      <div className="mt-4 -mx-4 sm:-mx-5 border-t border-[var(--border)]">
        {b.invoices.length === 0 ? (
          <EmptyState
            title="No invoices"
            body="Nothing has been invoiced to this family yet."
            action={<Link href={`${invoicesHref}&new=1`} className={btn.secondary}>Issue invoice</Link>}
          />
        ) : (
          <div className={table.wrap}>
            <table className={`${table.table} min-w-[480px]`}>
              <thead>
                <tr>
                  <th scope="col" className={table.th}>Issued</th>
                  <th scope="col" className={table.th}>Status</th>
                  <th scope="col" className={`${table.th} text-right`}>Amount</th>
                  <th scope="col" className={table.th}>Due</th>
                </tr>
              </thead>
              <tbody>
                {b.invoices.map((i) => (
                  <tr key={i.id} className={table.tr}>
                    <td className={table.td}><ShortDate iso={i.createdAt} /></td>
                    <td className={table.td}><StatusBadge status={i.status} /></td>
                    <td className={`${table.td} text-right tabular-nums`}>{money(i.amountDueCents, i.currency)}</td>
                    <td className={table.td}>{i.dueDate ? <ShortDate iso={i.dueDate} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {b.totalInvoices > b.invoices.length && (
              <p className="px-4 py-2 text-xs text-[var(--text-secondary)]">
                Showing the latest {b.invoices.length} of {b.totalInvoices}. <Link href={invoicesHref} className="underline">See all</Link>
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function ObserversPanel({ data }: { data: Student360 }) {
  return (
    <Panel title="Observers" description="People the family added to receive progress digests. Read-only here.">
      {data.observers.length === 0 ? (
        <EmptyState title="No observers" body="The family has not added anyone to receive updates." />
      ) : (
        <ul className="space-y-2">
          {data.observers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-all text-[var(--text-primary)]">{o.email}</span>
              <span className="flex flex-wrap gap-1.5">
                <Badge tone={o.isActive ? "success" : "neutral"}>{o.isActive ? "Active" : "Paused"}</Badge>
                <Badge>{humanize(o.frequency)}</Badge>
                {!o.seesThisStudent && <Badge tone="warning">Not for this child</Badge>}
                {o.seesThisStudent && !o.allProfiles && <Badge tone="info">This child only</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function ProgressPanel({ data }: { data: Student360 }) {
  const p = data.progress;
  const empty = p.latest.length === 0 && data.feedback.length === 0;
  return (
    <Panel
      title="Progress and feedback"
      description={p.totalLessons > 0 ? `${p.completed} of ${p.totalLessons} lessons in ${humanize(data.profile.track)} completed.` : undefined}
    >
      {empty ? (
        <EmptyState title="Nothing recorded yet" body="Teachers record lesson progress and feedback after classes." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <section aria-label="Latest lesson progress">
            <h3 className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Latest lessons</h3>
            {p.latest.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No lesson records.</p>
            ) : (
              <ul className="space-y-3">
                {p.latest.map((r) => (
                  <li key={r.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--text-primary)]">{r.lessonTitle ?? "Lesson"}</span>
                      <Badge tone={r.isCompleted ? "success" : "info"}>{r.isCompleted ? "Completed" : "In progress"}</Badge>
                      {r.score !== null && <span className="text-xs text-[var(--text-secondary)]">Score {r.score}</span>}
                    </div>
                    {r.teacherNotes && <p className="mt-0.5 text-[var(--text-secondary)]">{r.teacherNotes}</p>}
                    <div className="text-xs text-[var(--text-tertiary)]"><LocalTime iso={r.updatedAt} mode="date-time" /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Teacher feedback">
            <h3 className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Teacher feedback</h3>
            {data.feedback.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No feedback recorded.</p>
            ) : (
              <ul className="space-y-3">
                {data.feedback.map((f) => (
                  <li key={f.id} className="text-sm">
                    <div className="font-semibold text-[var(--text-primary)]">{f.teacherName}</div>
                    {(f.notes || f.transcription) && <p className="mt-0.5 text-[var(--text-secondary)]">{f.notes || f.transcription}</p>}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                      <LocalTime iso={f.createdAt} mode="date-time" />
                      <a href={f.audioUrl} target="_blank" rel="noreferrer" className="underline hover:text-[var(--accent)]">Audio</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Panel>
  );
}
