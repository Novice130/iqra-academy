"use client";

/**
 * @fileoverview Profile panel on the student 360, with an inline edit form.
 *
 * Saves through the existing PATCH /api/students/profiles/[id] and sends only
 * the fields that route accepts. Date of birth is a calendar date, not an
 * instant, so it travels as midnight UTC and is shown in UTC — converting it
 * to the viewer's zone would move a birthday by a day west of Greenwich.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DefinitionList, Panel, btn, humanize, input, label } from "../../_components/ui";
import ShortDate from "../ShortDate";

const TRACKS = ["QAIDAH", "QURAN_READING", "HIFZ"] as const;

export interface ProfileView {
  id: string;
  name: string;
  track: string;
  currentLevel: string;
  notes: string | null;
  dateOfBirth: string | null;
  createdAt: string;
}

function ageFrom(dobIso: string): number | null {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 0 ? age : null;
}

function dobLabel(dobIso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(dobIso)
  );
}

export default function ProfilePanel({ profile, familyZone }: { profile: ProfileView; familyZone: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: profile.name,
    dob: profile.dateOfBirth?.slice(0, 10) ?? "",
    track: profile.track,
    currentLevel: profile.currentLevel,
    notes: profile.notes ?? "",
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          dateOfBirth: form.dob ? `${form.dob}T00:00:00.000Z` : null,
          track: form.track,
          currentLevel: form.currentLevel.trim(),
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(data.details) ? data.details.map((d: { message: string }) => d.message).join(" ") : "";
        throw new Error(detail || data.error || "Could not save the profile.");
      }
      setEditing(false);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the profile.");
    } finally {
      setSaving(false);
    }
  }

  const age = profile.dateOfBirth ? ageFrom(profile.dateOfBirth) : null;

  return (
    <Panel
      title="Profile"
      actions={
        !editing && (
          <button type="button" className={btn.ghost} onClick={() => { setEditing(true); setSaved(false); }}>
            Edit profile
          </button>
        )
      }
    >
      {editing ? (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2">
            <label htmlFor="p-name" className={label}>Name</label>
            <input id="p-name" className={input} required maxLength={100} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="p-dob" className={label}>Date of birth</label>
            <input id="p-dob" type="date" className={input} value={form.dob}
              onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </div>
          <div>
            <label htmlFor="p-track" className={label}>Track</label>
            <select id="p-track" className={input} value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })}>
              {TRACKS.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="p-level" className={label}>Level</label>
            <input id="p-level" className={input} maxLength={100} value={form.currentLevel}
              onChange={(e) => setForm({ ...form, currentLevel: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="p-notes" className={label}>Notes</label>
            <textarea id="p-notes" rows={3} maxLength={500} className={`${input} h-auto py-2`} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {error && (
            <p role="alert" className="sm:col-span-2 text-sm text-[var(--color-danger)]">{error}</p>
          )}
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button type="submit" className={btn.primary} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className={btn.secondary} disabled={saving} onClick={() => { setEditing(false); setError(null); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {saved && <p role="status" className="mb-3 text-sm text-[var(--color-success)]">Profile saved.</p>}
          <DefinitionList
            items={[
              { term: "Age", value: age !== null ? `${age}` : "Not given" },
              { term: "Date of birth", value: profile.dateOfBirth ? dobLabel(profile.dateOfBirth) : "Not given" },
              { term: "Track", value: humanize(profile.track) },
              { term: "Level", value: profile.currentLevel },
              { term: "Family time zone", value: familyZone ?? "Not set (uses their device)" },
              { term: "Profile created", value: <ShortDate iso={profile.createdAt} /> },
              { term: "Notes", value: profile.notes || "None" },
            ]}
          />
        </>
      )}
    </Panel>
  );
}
