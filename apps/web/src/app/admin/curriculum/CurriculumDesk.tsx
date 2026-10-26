"use client";

/**
 * @fileoverview Interactive half of /admin/curriculum: one panel per track
 * with its lesson table, the add/edit form, and one message line. Changes
 * re-read the server with router.refresh() so order and counts stay true.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel, btn } from "../_components/ui";
import LessonForm from "./LessonForm";
import LessonTable from "./LessonTable";
import { TRACKS, type CurriculumLesson, type DeskMessage, type Track } from "./shared";

export default function CurriculumDesk({ orgId, lessons }: { orgId: string; lessons: CurriculumLesson[] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [adding, setAdding] = useState<Track | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<DeskMessage | null>(null);

  function changed(msg: DeskMessage) {
    setMessage(msg);
    if (!msg.bad) {
      setAdding(null);
      setEditingId(null);
      startRefresh(() => router.refresh());
    }
  }

  const editing = editingId ? lessons.find((l) => l.id === editingId) : undefined;
  const formOpen = adding !== null || editingId !== null;

  return (
    <div className="space-y-4">
      {message && (
        <div
          role={message.bad ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            message.bad
              ? "border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
              : "border-[var(--color-success)]/25 bg-[var(--color-success)]/10 text-[var(--color-success)]"
          }`}
        >
          {message.bad ? "Error: " : ""}
          {message.text}
          {refreshing && <span className="ml-2 font-normal text-[var(--text-tertiary)]">Updating…</span>}
        </div>
      )}

      {TRACKS.map((t) => {
        const rows = lessons.filter((l) => l.track === t.value);
        const active = rows.filter((l) => l.isActive).length;
        const editingHere = editing?.track === t.value ? editing : undefined;
        const showForm = adding === t.value || editingHere;

        return (
          <Panel
            key={t.value}
            id={`track-${t.value}`}
            title={t.label}
            description={
              rows.length > 0
                ? `${active} active ${active === 1 ? "lesson" : "lessons"}${
                    rows.length > active ? `, ${rows.length - active} inactive` : ""
                  }. ${t.blurb}`
                : t.blurb
            }
            actions={
              rows.length > 0 && !showForm ? (
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={formOpen}
                  onClick={() => {
                    setMessage(null);
                    setAdding(t.value);
                  }}
                >
                  Add lesson
                </button>
              ) : undefined
            }
            flush={rows.length > 0 && !showForm}
          >
            {showForm ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {editingHere ? `Edit "${editingHere.title}"` : `New ${t.label} lesson`}
                </h3>
                <LessonForm
                  key={editingHere?.id ?? `new-${t.value}`}
                  track={t.value}
                  orgId={orgId}
                  lesson={editingHere}
                  onDone={changed}
                  onCancel={() => {
                    setAdding(null);
                    setEditingId(null);
                  }}
                />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                title={`No ${t.label} lessons yet`}
                body="Teachers record progress against these lessons, so they can't record any for this track until you add one."
                action={
                  <button
                    type="button"
                    className={btn.primary}
                    disabled={formOpen}
                    onClick={() => {
                      setMessage(null);
                      setAdding(t.value);
                    }}
                  >
                    Add first lesson
                  </button>
                }
              />
            ) : (
              <LessonTable
                lessons={rows}
                editingId={editingId}
                onEdit={(id) => {
                  setMessage(null);
                  setEditingId(id);
                }}
                onChanged={changed}
              />
            )}
          </Panel>
        );
      })}
    </div>
  );
}
