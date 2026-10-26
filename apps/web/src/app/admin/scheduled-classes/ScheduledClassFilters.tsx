/**
 * @fileoverview The filter bar above the scheduled-classes table: a plain GET
 * form, so filters live in the URL, survive a reload, and are applied by the
 * server (./load.ts). Server-rendered; no client state.
 */

import Link from "next/link";
import { Panel, btn, input, label } from "@/app/admin/_components/ui";
import type { ClassFilterValues } from "./load";

const TRACKS = [
  { value: "ALL", label: "All tracks" },
  { value: "QAIDAH", label: "Qaidah" },
  { value: "QURAN_READING", label: "Quran reading" },
  { value: "HIFZ", label: "Hifz" },
];

const STATUSES = [
  { value: "ACTIVE", label: "Not cancelled" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "NO_SHOW", label: "No-show" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ALL", label: "All" },
];

const WINDOWS = [
  { value: "7", label: "Next 7 days" },
  { value: "14", label: "Next 14 days" },
  { value: "30", label: "Next 30 days" },
  { value: "90", label: "Next 90 days" },
  { value: "ALL", label: "All upcoming" },
];

function Select({ name, text, value, options }: { name: string; text: string; value: string; options: { value: string; label: string }[] }) {
  const id = `filter-${name}`;
  return (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <select id={id} name={name} defaultValue={value} className={input}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ScheduledClassFilters({
  value,
  teachers,
  total,
  zone,
}: {
  value: ClassFilterValues;
  teachers: { id: string; name: string }[];
  total: number;
  zone: string;
}) {
  return (
    <Panel>
      <form method="get" action="/admin/scheduled-classes" className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            name="teacher"
            text="Teacher"
            value={value.teacher}
            options={[{ value: "ALL", label: `All teachers (${teachers.length})` }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]}
          />
          <Select name="track" text="Track" value={value.track} options={TRACKS} />
          <Select name="status" text="Status" value={value.status} options={STATUSES} />
          <Select name="window" text="Window" value={value.window} options={WINDOWS} />
          <div>
            <label htmlFor="filter-q" className={label}>
              Search
            </label>
            <input id="filter-q" name="q" type="search" defaultValue={value.q} placeholder="Student, teacher, title" maxLength={100} className={input} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-secondary)]">
            {total} matching {total === 1 ? "class" : "classes"} · times in {zone}
          </p>
          <div className="flex gap-2">
            <Link href="/admin/scheduled-classes" className={btn.ghost}>
              Reset
            </Link>
            <button type="submit" className={btn.secondary}>
              Apply filters
            </button>
          </div>
        </div>
      </form>
    </Panel>
  );
}
