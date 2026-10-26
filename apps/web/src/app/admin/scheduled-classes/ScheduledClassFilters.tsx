"use client";

/**
 * @fileoverview The filter bar above the scheduled-classes table.
 * Controlled: the table owns the values so it can reset paging on change.
 */

import { input, label } from "@/app/admin/_components/ui";
import type { TeacherFilterOption } from "./ScheduledClassesTable";

export interface ClassFilters {
  teacher: string;
  track: string;
  status: string;
  window: string;
  search: string;
}

export const DEFAULT_FILTERS: ClassFilters = { teacher: "ALL", track: "ALL", status: "ACTIVE", window: "30", search: "" };

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

function Select({
  id,
  text,
  value,
  options,
  onChange,
}: {
  id: string;
  text: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
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
  onChange,
}: {
  value: ClassFilters;
  teachers: TeacherFilterOption[];
  onChange: (next: ClassFilters) => void;
}) {
  const set = (key: keyof ClassFilters) => (v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Select
        id="filter-teacher"
        text="Teacher"
        value={value.teacher}
        onChange={set("teacher")}
        options={[{ value: "ALL", label: `All teachers (${teachers.length})` }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]}
      />
      <Select id="filter-track" text="Track" value={value.track} onChange={set("track")} options={TRACKS} />
      <Select id="filter-status" text="Status" value={value.status} onChange={set("status")} options={STATUSES} />
      <Select id="filter-window" text="Window" value={value.window} onChange={set("window")} options={WINDOWS} />
      <div>
        <label htmlFor="filter-search" className={label}>
          Search
        </label>
        <input
          id="filter-search"
          type="search"
          placeholder="Student, teacher, title"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          className={input}
        />
      </div>
    </div>
  );
}
