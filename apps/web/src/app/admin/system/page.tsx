/**
 * @fileoverview /admin/system — is everything the school depends on working?
 *
 * Every number on this page comes from a check run for this request (see
 * lib/admin-ops). A failed check shows as a failed panel with its message;
 * nothing says "Healthy" because a check was skipped. The realtime sidecar
 * panel is left out entirely where the app has no sidecar to talk to.
 *
 * Scope: an ORG_ADMIN's counts and rooms are their org's; a SUPER_ADMIN's
 * are everyone's. Database, LiveKit and sidecar reachability are shared.
 */

import Link from "next/link";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import LocalTime from "@/components/LocalTime";
import {
  STALE_AFTER_MIN,
  probeCrm,
  probeDatabase,
  probeDeliveryCounts,
  probeLiveKit,
  probeOutbox,
  probeSidecar,
  probeStaleSessions,
  type Probe,
} from "@/lib/admin-ops";
import { Badge, DefinitionList, EmptyState, PageHeader, Panel, StatCard, StatGrid, type Tone } from "../_components/ui";
import LiveRoomsTable from "./LiveRoomsTable";
import RefreshButton from "./RefreshButton";

export const dynamic = "force-dynamic";

/** "Checked at 4:05:12 PM", in the viewer's zone. */
function Checked({ probe }: { probe: Probe<unknown> }) {
  return (
    <>
      Checked at <LocalTime iso={probe.checkedAt} mode="time-seconds" />
    </>
  );
}

function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}

function Failure({ error }: { error: string }) {
  return (
    <p role="alert" className="text-sm text-[var(--color-danger)] break-words">
      {error}
    </p>
  );
}

/** "3 min", "2 h 5 min", "4 d" — a duration, so no zone is involved. */
function age(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.floor(min / 1440)} d`;
}

export default async function AdminSystemPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/system");
    // The probes apply orgFilter's rule themselves, from a scope object the
    // livekit-rooms API route can build too, so the two agree on who sees what.
    const scope = { orgId: admin.orgId, role: admin.role };

    const [database, livekit, stale, outbox, crm, delivery, sidecar] = await Promise.all([
      probeDatabase(),
      probeLiveKit(scope),
      probeStaleSessions(scope),
      probeOutbox(scope),
      probeCrm(scope),
      probeDeliveryCounts(scope),
      probeSidecar(),
    ]);
    const now = Date.now();
    const orphans = livekit.ok ? livekit.data.filter((r) => r.orphan).length : 0;
    const outboxBacklogged = outbox.ok && outbox.data.oldestPendingAt !== null && now - new Date(outbox.data.oldestPendingAt).getTime() > 5 * 60_000;

    return (
      <>
        <PageHeader
          title="System health"
          description={admin.isSuperAdmin ? "Checks across every organisation." : "Checks for your organisation, plus the services every organisation shares."}
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "System health" }]}
          actions={<RefreshButton />}
        />

        <StatGrid>
          <StatCard label="Database" value={database.ok ? `${database.data.latencyMs} ms` : "Down"} tone={database.ok ? "success" : "danger"} hint={database.ok ? "Round trip" : "Query failed"} />
          <StatCard label="Open rooms" value={livekit.ok ? livekit.data.length : "—"} tone={livekit.ok ? "neutral" : "danger"} hint={livekit.ok ? "On LiveKit" : "LiveKit unreachable"} />
          <StatCard label="Orphan rooms" value={livekit.ok ? orphans : "—"} tone={orphans > 0 ? "danger" : "neutral"} hint="No class running" />
          <StatCard label="Stuck classes" value={stale.ok ? stale.data.length : "—"} tone={stale.ok && stale.data.length > 0 ? "warning" : "neutral"} hint={`Over ${STALE_AFTER_MIN} min past end`} />
          <StatCard label="Outbox pending" value={outbox.ok ? outbox.data.pending : "—"} tone={outboxBacklogged ? "warning" : "neutral"} hint="Realtime events" />
          <StatCard label="Dead letters" value={outbox.ok ? outbox.data.deadLettered : "—"} tone={outbox.ok && outbox.data.deadLettered > 0 ? "danger" : "neutral"} hint="Gave up retrying" />
        </StatGrid>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="App and database"
            description={<Checked probe={database} />}
            actions={database.ok ? <Status tone="success">Reachable</Status> : <Status tone="danger">Unreachable</Status>}
          >
            {database.ok ? (
              <DefinitionList items={[{ term: "Query latency", value: `${database.data.latencyMs} ms for select 1` }]} />
            ) : (
              <Failure error={database.error} />
            )}
          </Panel>

          {sidecar && (
            <Panel
              title="Realtime sidecar"
              description={<Checked probe={sidecar} />}
              actions={sidecar.ok ? <Status tone="success">Reachable</Status> : <Status tone="danger">Unreachable</Status>}
            >
              {sidecar.ok ? (
                <DefinitionList
                  items={[
                    { term: "Health check", value: `${sidecar.data.latencyMs} ms` },
                    { term: "Address from", value: sidecar.data.source },
                    { term: "Org hubs open", value: sidecar.data.hubs ?? "Not reported" },
                    { term: "Live sockets", value: sidecar.data.sockets ?? "Not reported" },
                  ]}
                />
              ) : (
                <Failure error={sidecar.error} />
              )}
            </Panel>
          )}

          <Panel
            title="Realtime outbox"
            description={<Checked probe={outbox} />}
            actions={
              !outbox.ok ? <Status tone="danger">Check failed</Status>
              : outbox.data.deadLettered > 0 ? <Status tone="danger">Dead letters</Status>
              : outboxBacklogged ? <Status tone="warning">Backlogged</Status>
              : <Status tone="success">Draining</Status>
            }
          >
            {outbox.ok ? (
              <DefinitionList
                items={[
                  { term: "Pending", value: outbox.data.pending },
                  { term: "Oldest pending", value: outbox.data.oldestPendingAt ? `${age(outbox.data.oldestPendingAt, now)} old` : "None" },
                  { term: "Dead-lettered (5 failed attempts)", value: outbox.data.deadLettered },
                  { term: "Last published", value: outbox.data.lastPublishedAt ? <LocalTime iso={outbox.data.lastPublishedAt} mode="date-time" withZone /> : "Never" },
                ]}
              />
            ) : (
              <Failure error={outbox.error} />
            )}
          </Panel>

          <Panel
            title="CRM sync"
            description={<Checked probe={crm} />}
            actions={!crm.ok ? <Status tone="danger">Check failed</Status> : crm.data.failures7d > 0 ? <Status tone="warning">Failures</Status> : <Status tone="success">No failures</Status>}
          >
            {crm.ok ? (
              <DefinitionList
                items={[
                  { term: "Failed syncs, last 7 days", value: crm.data.failures7d },
                  {
                    term: "Latest error",
                    value: crm.data.latestError ? (
                      <>
                        <span className="block">{crm.data.latestError.message || "No message recorded"}</span>
                        <span className="text-xs text-[var(--text-tertiary)]"><LocalTime iso={crm.data.latestError.at} mode="date-time" withZone /></span>
                      </>
                    ) : "None",
                  },
                ]}
              />
            ) : (
              <Failure error={crm.error} />
            )}
          </Panel>

          <Panel title="Guests and notifications" description={<Checked probe={delivery} />} actions={delivery.ok ? undefined : <Status tone="danger">Check failed</Status>}>
            {delivery.ok ? (
              <DefinitionList
                items={[
                  { term: "Guest join requests waiting", value: delivery.data.guestRequestsPending },
                  { term: "Web push subscriptions", value: delivery.data.pushSubscriptions },
                  { term: "Mobile device tokens", value: delivery.data.deviceTokens },
                ]}
              />
            ) : (
              <Failure error={delivery.error} />
            )}
          </Panel>
        </div>

        <Panel
          title="LiveKit rooms"
          description={<Checked probe={livekit} />}
          actions={
            !livekit.ok ? <Status tone="danger">Unreachable</Status>
            : orphans > 0 ? <Status tone="danger">{orphans} orphan{orphans === 1 ? "" : "s"}</Status>
            : <Status tone="success">Reachable</Status>
          }
          flush={livekit.ok}
        >
          {livekit.ok ? <LiveRoomsTable rooms={livekit.data} /> : <Failure error={livekit.error} />}
        </Panel>

        <Panel
          title="Stuck classes"
          description={<>Still in progress more than {STALE_AFTER_MIN} minutes after their scheduled end. <Checked probe={stale} /></>}
          actions={!stale.ok ? <Status tone="danger">Check failed</Status> : stale.data.length > 0 ? <Status tone="warning">{stale.data.length} stuck</Status> : <Status tone="success">None</Status>}
          flush={stale.ok && stale.data.length > 0}
        >
          {!stale.ok ? (
            <Failure error={stale.error} />
          ) : stale.data.length === 0 ? (
            <EmptyState title="No stuck classes" body="Every class marked in progress is within its scheduled time." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {stale.data.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <Link href={`/admin/sessions/${s.id}`} className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline underline-offset-2">
                      {s.title || "Untitled class"}
                    </Link>
                    <div className="text-xs text-[var(--text-secondary)]">{s.teacherName ?? "Unknown teacher"}</div>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Should have ended <LocalTime iso={s.scheduledEnd} mode="date-time" withZone /> ({age(s.scheduledEnd, now)} ago)
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </>
    );
  });
}
