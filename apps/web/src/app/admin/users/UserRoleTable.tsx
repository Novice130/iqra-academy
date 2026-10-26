"use client";

/**
 * @fileoverview Users & roles: search, role filter, add, re-role and remove.
 *
 * The list arrives from the server once; changes are applied locally from
 * the API's answers and then `router.refresh()` reconciles, so the table
 * doesn't flash empty after every edit.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import { EmptyState, Panel, btn, input, table } from "../_components/ui";
import AddUserForm from "./AddUserForm";
import UserRow, { type AdminUserRow } from "./UserRow";

export type { AdminUserRow };

type RoleFilter = "ALL" | "STUDENT" | "TEACHER" | "ADMIN";

const FILTERS: { key: RoleFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "TEACHER", label: "Teachers" },
  { key: "STUDENT", label: "Students" },
  { key: "ADMIN", label: "Admins" },
];

function matchesFilter(u: AdminUserRow, f: RoleFilter): boolean {
  if (f === "ALL") return true;
  if (f === "ADMIN") return u.role === "ORG_ADMIN" || u.role === "SUPER_ADMIN";
  return u.role === f;
}

export default function UserRoleTable({
  initialUsers,
  currentUserId,
  currentRole,
  openNew,
  newRole,
}: {
  initialUsers: AdminUserRow[];
  currentUserId: string;
  currentRole: UserRole;
  /** From `?new=` — open the add form on arrival. */
  openNew: boolean;
  newRole: UserRole;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("ALL");
  const [adding, setAdding] = useState(openNew);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, users.filter((u) => matchesFilter(u, f.key)).length])) as Record<RoleFilter, number>,
    [users]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        matchesFilter(u, filter) &&
        (!q || (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? "").toLowerCase().includes(q))
    );
  }, [users, search, filter]);

  function refresh(message: string) {
    setNotice(message);
    startTransition(() => router.refresh());
  }

  function upsert(user: AdminUserRow, message: string) {
    setUsers((prev) => (prev.some((u) => u.id === user.id) ? prev.map((u) => (u.id === user.id ? user : u)) : [user, ...prev]));
    refresh(message);
  }

  return (
    <div className="space-y-6">
      {adding ? (
        <Panel title="Add user" description="They sign in with this email. If it already has an account here, its role is changed instead.">
          <AddUserForm
            presetRole={newRole}
            currentRole={currentRole}
            onCancel={() => setAdding(false)}
            onDone={(u, m) => {
              setAdding(false);
              upsert(u, m);
            }}
          />
        </Panel>
      ) : null}

      <Panel
        title="People"
        description={`${users.length} active accounts. A removed account loses access and is hidden; its history is kept.`}
        actions={
          !adding && (
            <button type="button" className={btn.primary} onClick={() => setAdding(true)}>
              Add user
            </button>
          )
        }
        flush
      >
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div role="group" aria-label="Filter by role" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`${btn.ghost} ${filter === f.key ? "bg-[var(--bg-secondary)] text-[var(--text-primary)] ring-1 ring-[var(--border)]" : ""}`}
              >
                {f.label} <span className="tabular-nums opacity-70">({counts[f.key]})</span>
              </button>
            ))}
          </div>
          <div className="w-full sm:w-72">
            <label htmlFor="user-search" className="sr-only">Search users</label>
            <input
              id="user-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or phone"
              className={input}
            />
          </div>
        </div>

        {notice && (
          <div role="status" className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--color-success)]/10 px-4 py-2.5 text-sm text-[var(--text-primary)] sm:px-5">
            <span>{notice}</span>
            <button type="button" className={btn.ghost} onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState
            title={users.length === 0 ? "No users yet" : "No users match"}
            body={
              users.length === 0
                ? "Add the first teacher or student."
                : `Nothing matches${search ? ` "${search}"` : ""}${filter !== "ALL" ? ` in ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}` : ""}.`
            }
          />
        ) : (
          <div className={table.wrap}>
            <table className={`${table.table} min-w-[720px]`}>
              <thead>
                <tr>
                  <th scope="col" className={table.th}>User</th>
                  <th scope="col" className={table.th}>Contact</th>
                  <th scope="col" className={table.th}>Role</th>
                  <th scope="col" className={table.th}>Joined</th>
                  <th scope="col" className={`${table.th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    currentUserId={currentUserId}
                    currentRole={currentRole}
                    onChanged={upsert}
                    onRemoved={(removed) => {
                      setUsers((prev) => prev.filter((x) => x.id !== removed.id));
                      refresh(`Removed ${removed.name || removed.email} (${ROLE_LABELS[removed.role]}).`);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
