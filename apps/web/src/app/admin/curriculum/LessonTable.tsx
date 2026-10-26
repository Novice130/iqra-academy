"use client";

/**
 * @fileoverview One track's lessons: order, completions, and the row actions
 * (move up/down, edit, deactivate/reactivate). Deactivating asks once inline;
 * it is reversible, but it takes the lesson out of every teacher's picker.
 */

import { useState } from "react";
import { Badge, btn, table } from "../_components/ui";
import { sendJson, type CurriculumLesson, type DeskMessage } from "./shared";

export default function LessonTable({
  lessons,
  editingId,
  onEdit,
  onChanged,
}: {
  lessons: CurriculumLesson[];
  editingId: string | null;
  onEdit: (id: string) => void;
  onChanged: (msg: DeskMessage) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function act(lesson: CurriculumLesson, body: Record<string, unknown>, done: string) {
    setBusyId(lesson.id);
    const failed = await sendJson(`/api/admin/curriculum/${lesson.id}`, "PATCH", body);
    setBusyId(null);
    setConfirmId(null);
    onChanged(failed ? { text: failed, bad: true } : { text: done, bad: false });
  }

  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col" className={table.th}>#</th>
            <th scope="col" className={table.th}>Lesson</th>
            <th scope="col" className={table.th}>Length</th>
            <th scope="col" className={table.th}>Completed by</th>
            <th scope="col" className={table.th}>Status</th>
            <th scope="col" className={`${table.th} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((l, i) => {
            const busy = busyId === l.id;
            const disabled = busyId !== null || editingId !== null;
            return (
              <tr key={l.id} className={`${table.tr} ${l.isActive ? "" : "opacity-70"}`}>
                <td className={`${table.td} tabular-nums text-[var(--text-secondary)]`}>{i + 1}</td>
                <td className={`${table.td} min-w-[14rem]`}>
                  <div className="font-medium">{l.title}</div>
                  {l.description && (
                    <div className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-2">{l.description}</div>
                  )}
                </td>
                <td className={`${table.td} whitespace-nowrap tabular-nums`}>{l.estimatedMinutes} min</td>
                <td className={`${table.td} whitespace-nowrap tabular-nums`}>
                  {l.completedCount} {l.completedCount === 1 ? "student" : "students"}
                </td>
                <td className={table.td}>
                  {l.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                </td>
                <td className={`${table.td} text-right`}>
                  {confirmId === l.id ? (
                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">Hide from teachers?</span>
                      <button
                        type="button"
                        className={btn.danger}
                        disabled={busy}
                        onClick={() => act(l, { op: "deactivate" }, `Deactivated "${l.title}".`)}
                      >
                        {busy ? "Deactivating…" : "Deactivate"}
                      </button>
                      <button type="button" className={btn.ghost} disabled={busy} onClick={() => setConfirmId(null)}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        className={btn.ghost}
                        disabled={disabled || i === 0}
                        aria-label={`Move "${l.title}" up`}
                        onClick={() => act(l, { op: "move", direction: "up" }, `Moved "${l.title}" up.`)}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className={btn.ghost}
                        disabled={disabled || i === lessons.length - 1}
                        aria-label={`Move "${l.title}" down`}
                        onClick={() => act(l, { op: "move", direction: "down" }, `Moved "${l.title}" down.`)}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className={btn.ghost}
                        disabled={disabled}
                        aria-label={`Edit "${l.title}"`}
                        onClick={() => onEdit(l.id)}
                      >
                        Edit
                      </button>
                      {l.isActive ? (
                        <button
                          type="button"
                          className={btn.ghost}
                          disabled={disabled}
                          aria-label={`Deactivate "${l.title}"`}
                          onClick={() => setConfirmId(l.id)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={btn.ghost}
                          disabled={disabled}
                          aria-label={`Reactivate "${l.title}"`}
                          onClick={() => act(l, { op: "reactivate" }, `Reactivated "${l.title}".`)}
                        >
                          {busy ? "Reactivating…" : "Reactivate"}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
