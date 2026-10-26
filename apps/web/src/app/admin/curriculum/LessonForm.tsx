"use client";

/**
 * @fileoverview Create or edit one lesson. The same form does both: with a
 * `lesson` it PATCHes that lesson, without one it appends to `track`.
 */

import { useId, useState } from "react";
import { btn, input, label } from "../_components/ui";
import { sendJson, type CurriculumLesson, type DeskMessage, type Track } from "./shared";

export default function LessonForm({
  track,
  orgId,
  lesson,
  onDone,
  onCancel,
}: {
  track: Track;
  orgId: string;
  lesson?: CurriculumLesson;
  onDone: (msg: DeskMessage) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [objectives, setObjectives] = useState((lesson?.objectives ?? []).join("\n"));
  const [minutes, setMinutes] = useState(String(lesson?.estimatedMinutes ?? 30));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const estimatedMinutes = Number(minutes);
    if (!title.trim()) return setError("Give the lesson a title.");
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 240) {
      return setError("Length must be a whole number of minutes from 5 to 240.");
    }
    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      objectives: objectives
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      estimatedMinutes,
    };

    setSaving(true);
    setError(null);
    const failed = lesson
      ? await sendJson(`/api/admin/curriculum/${lesson.id}`, "PATCH", { op: "update", ...fields })
      : await sendJson("/api/admin/curriculum", "POST", { ...fields, track, orgId });
    setSaving(false);
    if (failed) return setError(failed);
    onDone({ text: lesson ? `Saved "${fields.title}".` : `Added "${fields.title}".`, bad: false });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <label htmlFor={`${id}-title`} className={label}>
            Title
          </label>
          <input
            id={`${id}-title`}
            className={input}
            value={title}
            maxLength={200}
            required
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-minutes`} className={label}>
            Length (minutes)
          </label>
          <input
            id={`${id}-minutes`}
            className={input}
            type="number"
            inputMode="numeric"
            min={5}
            max={240}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-description`} className={label}>
          Description <span className="font-normal text-[var(--text-tertiary)]">(optional)</span>
        </label>
        <textarea
          id={`${id}-description`}
          className={`${input} h-20 py-2`}
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${id}-objectives`} className={label}>
          Objectives <span className="font-normal text-[var(--text-tertiary)]">(one per line, shown to the teacher)</span>
        </label>
        <textarea
          id={`${id}-objectives`}
          className={`${input} h-20 py-2`}
          value={objectives}
          onChange={(e) => setObjectives(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          Error: {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.primary} disabled={saving}>
          {saving ? "Saving…" : lesson ? "Save lesson" : "Add lesson"}
        </button>
        <button type="button" className={btn.secondary} disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
