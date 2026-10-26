"use client";

/**
 * @fileoverview One teacher's day, in two densities — a summary and a
 * half-hour list. Shared by the desktop grid and the mobile cards, which used
 * to be two separate renderings that disagreed.
 *
 * Every instant arrives precomputed from the server; this file only compares
 * and formats, always in the `zone` the week was built in.
 */

import Link from "next/link";
import { formatInZone } from "@/components/LocalTime";
import { Badge, humanize, statusTone } from "@/app/admin/_components/ui";
import type { ScheduleDay, TeacherScheduleData } from "./TeacherSpreadsheet";

type Range = { startIso: string; endIso: string };
const ms = (iso: string) => new Date(iso).getTime();
const overlaps = (r: Range, start: number, end: number) => ms(r.startIso) < end && ms(r.endIso) > start;
const covers = (r: Range, at: number) => ms(r.startIso) <= at && ms(r.endIso) > at;

export function assignHref(teacherId: string, day: ScheduleDay, time: string, zone: string): string {
  const q = new URLSearchParams({ teacherId, date: day.key, time, tz: zone });
  return `/admin/assign-student?${q.toString()}`;
}

/** What one teacher has on one day. */
export function dayView(teacher: TeacherScheduleData, day: ScheduleDay) {
  const start = ms(day.startIso);
  const end = ms(day.endIso);
  const sessions = teacher.sessions.filter((s) => ms(s.startIso) >= start && ms(s.startIso) < end);
  const live = sessions.filter((s) => s.status !== "CANCELLED");
  const timeOff = teacher.timeOff.filter((o) => overlaps(o, start, end));
  const available = teacher.available.filter((a) => ms(a.startIso) >= start && ms(a.startIso) < end);

  // Each half hour: booked beats off beats open.
  const slots = day.slots.map((slot) => {
    const at = ms(slot.iso);
    const booked = live.find((s) => covers(s, at));
    const off = !booked && timeOff.some((o) => covers(o, at));
    const open = !booked && !off && available.some((a) => covers(a, at));
    return { ...slot, booked, off, open };
  });

  // Contiguous availability, merged for the summary line.
  const ranges: Range[] = [];
  for (const a of available) {
    const last = ranges[ranges.length - 1];
    if (last && last.endIso === a.startIso) last.endIso = a.endIso;
    else ranges.push({ ...a });
  }

  return { sessions, timeOff, ranges, slots, firstOpen: slots.find((s) => s.open) ?? null };
}

const time = (iso: string, zone: string) => formatInZone(iso, "time", false, zone);

function SessionBlock({ s, zone }: { s: TeacherScheduleData["sessions"][number]; zone: string }) {
  const cancelled = s.status === "CANCELLED";
  return (
    <Link
      href={`/admin/sessions/${s.id}`}
      className={`block rounded-lg border p-2 text-xs transition hover:border-[var(--accent)] ${
        cancelled ? "border-[var(--border)] opacity-70" : "border-[var(--accent)]/30 bg-[var(--accent-light)]"
      }`}
    >
      <div className={`font-semibold text-[var(--text-primary)] truncate ${cancelled ? "line-through" : ""}`}>{s.studentNames}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[var(--text-secondary)]">
        <span>
          {time(s.startIso, zone)} – {time(s.endIso, zone)}
        </span>
        {s.status !== "SCHEDULED" && <Badge tone={statusTone(s.status)}>{s.status === "IN_PROGRESS" ? "Live" : humanize(s.status)}</Badge>}
      </div>
    </Link>
  );
}

export function DaySummary({ teacher, day, zone }: { teacher: TeacherScheduleData; day: ScheduleDay; zone: string }) {
  const v = dayView(teacher, day);
  return (
    <div className="space-y-2">
      {v.timeOff.length > 0 && (
        <Badge tone="warning">
          Time off{v.timeOff[0].reason ? `: ${v.timeOff[0].reason}` : ""}
        </Badge>
      )}
      {v.ranges.length > 0 && (
        <div className="text-[11px] text-[var(--text-secondary)]">
          <span className="font-semibold">Available </span>
          {v.ranges.map((r) => `${time(r.startIso, zone)}–${time(r.endIso, zone)}`).join(", ")}
        </div>
      )}
      {v.sessions.map((s) => (
        <SessionBlock key={s.id} s={s} zone={zone} />
      ))}
      {v.firstOpen ? (
        <Link
          href={assignHref(teacher.id, day, v.firstOpen.label, zone)}
          className="block rounded-lg border border-dashed border-[var(--border)] px-2 py-1.5 text-center text-[11px] font-semibold text-[var(--accent)] hover:border-[var(--accent)]"
        >
          Assign at {v.firstOpen.label}
        </Link>
      ) : (
        v.sessions.length === 0 && <div className="text-[11px] text-[var(--text-tertiary)]">{v.timeOff.length > 0 ? "Off" : "No open hours"}</div>
      )}
    </div>
  );
}

export function SlotList({ teacher, day, zone }: { teacher: TeacherScheduleData; day: ScheduleDay; zone: string }) {
  const v = dayView(teacher, day);
  return (
    <ul className="space-y-0.5 max-h-[380px] overflow-y-auto pr-1">
      {v.slots.map((slot) => (
        <li key={slot.label} className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px]">
          <span className="font-mono text-[var(--text-tertiary)]">{slot.label}</span>
          {slot.booked ? (
            <Link href={`/admin/sessions/${slot.booked.id}`} className="truncate font-semibold text-[var(--accent)] hover:underline">
              {slot.booked.studentNames}
            </Link>
          ) : slot.off ? (
            <span className="text-[var(--color-warning)]">Off</span>
          ) : slot.open ? (
            <Link href={assignHref(teacher.id, day, slot.label, zone)} className="font-semibold text-[var(--color-success)] hover:underline">
              Open: assign
            </Link>
          ) : (
            <span className="text-[var(--text-tertiary)]" aria-label="Not available">
              —
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
