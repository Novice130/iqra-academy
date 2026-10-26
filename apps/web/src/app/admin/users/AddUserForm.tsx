"use client";

/**
 * @fileoverview "Add user" — POST /api/admin/users.
 *
 * If the email already has an account in the org, the API changes that
 * account's role instead of creating a second one (email is unique per org),
 * and restores it if it had been removed. The success message says which
 * happened, so an admin who meant to add a stranger notices.
 *
 * The person signs in with that email afterwards; nothing here sends them a
 * password.
 */

import { useState } from "react";
import { ROLE_HIERARCHY, ROLE_LABELS, type UserRole } from "@/lib/roles";
import { ZONES } from "@/lib/zones";
import { btn, input, label } from "../_components/ui";
import { apiMessage, fieldIssues } from "./api-message";
import type { AdminUserRow } from "./UserRow";

const CREATABLE: UserRole[] = ["STUDENT", "TEACHER", "ORG_ADMIN"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "email" | "name" | "role" | "phone" | "timezone";

export default function AddUserForm({
  presetRole,
  currentRole,
  onDone,
  onCancel,
}: {
  presetRole: UserRole;
  currentRole: UserRole;
  onDone: (user: AdminUserRow, message: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ email: "", name: "", role: presetRole, phone: "", timezone: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const roles = CREATABLE.filter((r) => ROLE_HIERARCHY[r] <= ROLE_HIERARCHY[currentRole]);
  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {};
    if (!EMAIL.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (form.name.trim().length > 100) next.name = "Name is too long.";
    if (form.phone.trim().length > 40) next.phone = "Phone number is too long.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          name: form.name.trim() || undefined,
          role: form.role,
          phone: form.phone.trim() || undefined,
          timezone: form.timezone || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const issues = fieldIssues(data);
        if (Object.keys(issues).length) setErrors(issues as Partial<Record<Field, string>>);
        else setFormError(apiMessage(data, "Could not add this user."));
        return;
      }
      const u = data.user;
      const row: AdminUserRow = {
        id: u.id,
        email: u.email,
        name: u.name ?? null,
        role: u.role,
        phone: u.phone ?? null,
        timezone: u.timezone ?? null,
        createdAt: new Date(u.createdAt).toISOString(),
      };
      const who = row.name || row.email;
      const message = data.restored
        ? `${who} had been removed. Their account is restored as ${ROLE_LABELS[row.role]}.`
        : data.promoted
          ? `${row.email} already had an account. It is now ${ROLE_LABELS[row.role]}.`
          : `Added ${who} as ${ROLE_LABELS[row.role]}. They sign in with ${row.email}.`;
      onDone(row, message);
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (f: Field) =>
    errors[f] ? (
      <p id={`new-${f}-error`} className="mt-1 text-xs font-medium text-[var(--color-danger)]">
        {errors[f]}
      </p>
    ) : null;
  const aria = (f: Field) => ({ "aria-invalid": Boolean(errors[f]), "aria-describedby": errors[f] ? `new-${f}-error` : undefined });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="new-email" className={label}>Email</label>
          <input id="new-email" type="email" autoComplete="off" required className={input} value={form.email} onChange={set("email")} {...aria("email")} />
          {fieldError("email")}
        </div>
        <div>
          <label htmlFor="new-name" className={label}>Name</label>
          <input id="new-name" type="text" className={input} value={form.name} onChange={set("name")} placeholder="Defaults to the email name" {...aria("name")} />
          {fieldError("name")}
        </div>
        <div>
          <label htmlFor="new-role" className={label}>Role</label>
          <select id="new-role" className={input} value={form.role} onChange={set("role")} {...aria("role")}>
            {roles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          {fieldError("role")}
        </div>
        <div>
          <label htmlFor="new-phone" className={label}>Phone (optional)</label>
          <input id="new-phone" type="tel" className={input} value={form.phone} onChange={set("phone")} {...aria("phone")} />
          {fieldError("phone")}
        </div>
        <div>
          <label htmlFor="new-timezone" className={label}>Time zone (optional)</label>
          <select id="new-timezone" className={input} value={form.timezone} onChange={set("timezone")} {...aria("timezone")}>
            <option value="">Follow their device</option>
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>{z.label}</option>
            ))}
          </select>
          {fieldError("timezone")}
        </div>
      </div>
      {formError && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">{formError}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.primary} disabled={saving}>
          {saving ? "Adding…" : `Add ${ROLE_LABELS[form.role].toLowerCase()}`}
        </button>
        <button type="button" className={btn.secondary} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
