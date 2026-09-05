"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import CallStudentButton from "./CallStudentButton";

export interface EnrichedStudent {
  id: string;
  name: string;
  track: string;
  age: string | number;
  lastClass: string | null;
  progress: number;
  currentLesson: string;
  teacherNotes: string | null;
}

interface TeacherStudentsClientProps {
  students: EnrichedStudent[];
}

export default function TeacherStudentsClient({ students }: TeacherStudentsClientProps) {
  const [search, setSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("ALL");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "progress-desc" | "progress-asc" | "lastClass-desc">("name-asc");

  // Extract unique tracks for filter dropdown
  const tracks = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.track) set.add(s.track);
    });
    return Array.from(set).sort();
  }, [students]);

  // Filtered and sorted students
  const filteredStudents = useMemo(() => {
    return students
      .filter((student) => {
        const matchesSearch =
          !search.trim() ||
          student.name.toLowerCase().includes(search.toLowerCase().trim()) ||
          student.currentLesson.toLowerCase().includes(search.toLowerCase().trim());
        const matchesTrack =
          selectedTrack === "ALL" || student.track.toUpperCase() === selectedTrack.toUpperCase();
        return matchesSearch && matchesTrack;
      })
      .sort((a, b) => {
        if (sortBy === "name-asc") return a.name.localeCompare(b.name);
        if (sortBy === "name-desc") return b.name.localeCompare(a.name);
        if (sortBy === "progress-desc") return b.progress - a.progress;
        if (sortBy === "progress-asc") return a.progress - b.progress;
        if (sortBy === "lastClass-desc") {
          if (!a.lastClass) return 1;
          if (!b.lastClass) return -1;
          return new Date(b.lastClass).getTime() - new Date(a.lastClass).getTime();
        }
        return 0;
      });
  }, [students, search, selectedTrack, sortBy]);

  const hasActiveFilters = Boolean(search.trim()) || selectedTrack !== "ALL";

  return (
    <div className="space-y-6">
      {/* Search, Filter, Sort Controls */}
      <div className="card p-4 sm:p-5 flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="flex-1 relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students by name or lesson…"
            className="input pl-10 h-11"
            aria-label="Search students"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-sm"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
          {/* Track Filter */}
          <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
            <label htmlFor="track-filter" className="text-xs font-semibold text-[var(--text-secondary)] shrink-0">
              Track:
            </label>
            <select
              id="track-filter"
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent)] h-11"
            >
              <option value="ALL">All Tracks ({students.length})</option>
              {tracks.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
            <label htmlFor="sort-selector" className="text-xs font-semibold text-[var(--text-secondary)] shrink-0">
              Sort:
            </label>
            <select
              id="sort-selector"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name-asc" | "name-desc" | "progress-desc" | "progress-asc" | "lastClass-desc")}
              className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent)] h-11"
            >
              <option value="name-asc">Name (A → Z)</option>
              <option value="name-desc">Name (Z → A)</option>
              <option value="progress-desc">Progress (High → Low)</option>
              <option value="progress-asc">Progress (Low → High)</option>
              <option value="lastClass-desc">Last Class (Recent First)</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSelectedTrack("ALL");
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent-light)] transition h-11"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between px-1 text-xs text-[var(--text-tertiary)]">
        <span>
          Showing {filteredStudents.length} of {students.length} student{students.length === 1 ? "" : "s"}
        </span>
      </div>

      {filteredStudents.length > 0 ? (
        <>
          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-secondary)]">
                  <tr>
                    <th scope="col" className="p-4 pl-6">Student</th>
                    <th scope="col" className="p-4">Track</th>
                    <th scope="col" className="p-4">Last Class</th>
                    <th scope="col" className="p-4 w-44">Progress</th>
                    <th scope="col" className="p-4">Current Lesson & Notes</th>
                    <th scope="col" className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredStudents.map((student) => {
                    const initials = student.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <tr key={student.id} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-xs"
                              style={{ background: "var(--accent)" }}
                            >
                              {initials}
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--text-primary)]">{student.name}</div>
                              <div className="text-xs text-[var(--text-tertiary)]">Age {student.age}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]">
                            {student.track.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-[var(--text-secondary)]">
                          {student.lastClass ? format(new Date(student.lastClass), "MMM d, yyyy") : "Never"}
                        </td>
                        <td className="p-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-[var(--text-secondary)]">Completion</span>
                              <span style={{ color: "var(--accent)" }}>{student.progress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden bg-[var(--bg-secondary)]">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${student.progress}%`, background: "var(--accent)" }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="p-4 max-w-xs">
                          <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {student.currentLesson}
                          </div>
                          {student.teacherNotes && (
                            <p className="text-xs text-[var(--text-tertiary)] italic truncate mt-0.5">
                              📝 {student.teacherNotes}
                            </p>
                          )}
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <CallStudentButton studentProfileId={student.id} studentName={student.name} />
                            <Link
                              href={`/dashboard/teacher/students/${student.id}`}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--accent-light)]"
                              style={{
                                background: "var(--bg-secondary)",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              View Details
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="block md:hidden space-y-4">
            {filteredStudents.map((student) => {
              const initials = student.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <div key={student.id} className="card p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-xs"
                        style={{ background: "var(--accent)" }}
                      >
                        {initials}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{student.name}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">
                          Age {student.age} • {student.track.replace(/_/g, " ").toLowerCase()}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)] shrink-0">
                      {student.lastClass ? format(new Date(student.lastClass), "MMM d") : "Never"}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)] truncate pr-2">{student.currentLesson}</span>
                      <span className="font-bold shrink-0" style={{ color: "var(--accent)" }}>
                        {student.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-[var(--bg-secondary)]">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${student.progress}%`, background: "var(--accent)" }}
                      />
                    </div>
                  </div>

                  {student.teacherNotes && (
                    <p className="text-xs italic text-[var(--text-tertiary)] truncate">
                      📝 {student.teacherNotes}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                    <CallStudentButton studentProfileId={student.id} studentName={student.name} />
                    <Link
                      href={`/dashboard/teacher/students/${student.id}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--accent-light)]"
                      style={{
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card p-12 text-center space-y-3">
          <span className="text-3xl">👥</span>
          <h3 className="text-base font-bold text-[var(--text-primary)]">
            {hasActiveFilters ? "No matching students found" : "No students assigned"}
          </h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            {hasActiveFilters
              ? "Try adjusting your search term or track filter."
              : "Students will appear here once they are registered and assigned to your classes."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSelectedTrack("ALL");
              }}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
