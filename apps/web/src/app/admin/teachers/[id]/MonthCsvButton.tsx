"use client";

/**
 * @fileoverview Download one teacher's month of classes as CSV, for payroll.
 *
 * Built in the browser from rows the page already has, so the times in the
 * file are in the admin's zone — the same ones on screen — and no export
 * endpoint is needed. lib/csv.ts quotes names with commas and defuses cells
 * that a spreadsheet would run as formulas.
 */

import { useState } from "react";
import { dayKeyInZone, formatInZone, useViewerTimeZone } from "@/components/LocalTime";
import type { TeacherClass } from "@/lib/admin-teachers";
import { toCsv } from "@/lib/csv";
import { btn } from "../../_components/ui";

const HEADER = [
  "Date",
  "Scheduled start",
  "Class",
  "Status",
  "Students booked",
  "Students attended",
  "Teacher joined",
  "Minutes late",
  "Minutes in room",
];

export default function MonthCsvButton({
  classes,
  teacherName,
  month,
}: {
  classes: TeacherClass[];
  teacherName: string;
  month: string;
}) {
  const zone = useViewerTimeZone();
  const [busy, setBusy] = useState(false);

  function download() {
    setBusy(true);
    try {
      const tz = zone || undefined;
      const rows = classes.map((c) => [
        c.scheduledStart ? dayKeyInZone(c.scheduledStart, tz) : "",
        c.scheduledStart ? formatInZone(c.scheduledStart, "time", true, tz) : "",
        c.title || "Class",
        c.status,
        c.students.map((s) => s.name).join("; "),
        c.students.filter((s) => s.status !== "ABSENT").length,
        c.teacherJoinedAt
          ? formatInZone(c.teacherJoinedAt, "time-seconds", true, tz)
          : c.status === "SCHEDULED" ? "" : "Did not join",
        c.teacherLateBySeconds !== null && c.teacherLateBySeconds > 0 ? Math.round(c.teacherLateBySeconds / 60) : 0,
        c.teacherSeconds !== null ? Math.round(c.teacherSeconds / 60) : "",
      ]);
      const totalMinutes = Math.round(classes.reduce((n, c) => n + (c.teacherSeconds ?? 0), 0) / 60);
      rows.push(["Total", "", "", "", "", "", "", "", totalMinutes]);

      const blob = new Blob([toCsv(HEADER, rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${teacherName.replace(/[^\w-]+/g, "-").toLowerCase() || "teacher"}-${month}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={btn.secondary} onClick={download} disabled={busy || classes.length === 0}>
      Download CSV
    </button>
  );
}
