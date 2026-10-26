"use client";

/**
 * @fileoverview One row of the users table: role change and remove.
 *
 * No action is offered where the API would refuse it — on yourself, on the
 * root admin, or on someone above your own role — so a click never ends in
 * a 403 the admin could have been spared. The API still enforces all three.
 */

import { useState } from "react";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import { isRootAdminEmail } from "@/lib/root-admin";
import { ROLE_HIERARCHY, ROLE_LABELS, ROLES, type UserRole } from "@/lib/roles";
import { Badge, btn, table } from "../_components/ui";
import { apiMessage } from "./api-message";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  phone: string | null;
  timezone: string | null;
  createdAt: string;
}

const ROLE_TONE: Record<UserRole, "neutral" | "success" | "info" | "warning"> = {
  STUDENT: "neutral",
  TEACHER: "success",
  ORG_ADMIN: "info",
  SUPER_ADMIN: "warning",
};

export default function UserRow({
  user,
  currentUserId,
  currentRole,
  onChanged,
  onRemoved,
}: {
  user: AdminUserRow;
  currentUserId: string;
  currentRole: UserRole;
  onChanged: (user: AdminUserRow, message: string) => void;
  onRemoved: (user: AdminUserRow) => void;
}) {
  const [busy, setBusy] = useState<"role" | "remove" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = user.id === currentUserId;
  const isRoot = isRootAdminEmail(user.email);
  const callerLevel = ROLE_HIERARCHY[currentRole];
  const locked = isSelf || isRoot || ROLE_HIERARCHY[user.role] > callerLevel;
  const lockReason = isSelf ? "You can't change your own account here." : isRoot ? "The root admin is protected." : "Above your role.";

  async function changeRole(role: UserRole) {
    setError(null);
    setBusy("role");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(apiMessage(data, "Could not change the role."));
      onChanged({ ...user, role }, `${user.name || user.email} is now ${ROLE_LABELS[role]}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the role.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setError(null);
    setBusy("remove");
    try {
      const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(apiMessage(data, "Could not remove this user."));
      onRemoved(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this user.");
      setBusy(null);
    }
  }

  const displayName = user.name || "Unnamed user";

  return (
    <tr className={table.tr}>
      <td className={table.td}>
        <div className="font-semibold">
          {user.role === "TEACHER" ? (
            <Link href={`/admin/teachers/${user.id}`} className="hover:text-[var(--accent)] hover:underline">
              {displayName}
            </Link>
          ) : (
            displayName
          )}
          {isSelf && (
            <span className="ml-2">
              <Badge>You</Badge>
            </span>
          )}
          {isRoot && (
            <span className="ml-2">
              <Badge tone="warning">Root admin</Badge>
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--text-secondary)] break-all">{user.email}</div>
        {error && (
          <p role="alert" className="mt-1 text-xs font-medium text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </td>
      <td className={table.td}>
        <div>{user.phone || <span className="text-[var(--text-tertiary)]">No phone</span>}</div>
        <div className="text-xs text-[var(--text-secondary)]">{user.timezone || "Zone not set"}</div>
      </td>
      <td className={table.td}>
        {locked ? (
          <span title={lockReason}>
            <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABELS[user.role]}</Badge>
          </span>
        ) : (
          <>
            <label htmlFor={`role-${user.id}`} className="sr-only">
              Role for {displayName}
            </label>
            <select
              id={`role-${user.id}`}
              value={user.role}
              disabled={busy !== null}
              onChange={(e) => changeRole(e.target.value as UserRole)}
              className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
            >
              {ROLES.filter((r) => ROLE_HIERARCHY[r] <= callerLevel).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {busy === "role" && <span className="ml-2 text-xs text-[var(--text-tertiary)]">Saving…</span>}
          </>
        )}
      </td>
      <td className={`${table.td} whitespace-nowrap text-xs text-[var(--text-secondary)]`}>
        <LocalTime iso={user.createdAt} mode="date" />
      </td>
      <td className={`${table.td} text-right`}>
        {locked ? (
          <span className="text-xs text-[var(--text-tertiary)]">—</span>
        ) : confirming ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-[var(--text-secondary)]">Remove {displayName}?</span>
            <button type="button" className={btn.danger} onClick={remove} disabled={busy !== null}>
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
            <button type="button" className={btn.ghost} onClick={() => setConfirming(false)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {user.role === "TEACHER" && (
              <Link href={`/admin/teachers/${user.id}`} className={btn.ghost}>
                View
              </Link>
            )}
            <button type="button" className={btn.ghost} onClick={() => setConfirming(true)} disabled={busy !== null}>
              Remove
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
