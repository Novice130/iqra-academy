"use client";

/**
 * User & Teacher Management Workspace (Twenty CRM Style).
 *
 * Provides real-time filtering, role elevation, 24h teacher availability editing,
 * and user management matching the Twenty CRM design language.
 */

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: "SUPER_ADMIN" | "ORG_ADMIN" | "TEACHER" | "STUDENT";
  phone: string | null;
  timezone: string | null;
  createdAt: string;
}

const ROLE_RANK: Record<string, number> = {
  STUDENT: 1,
  TEACHER: 2,
  ORG_ADMIN: 3,
  SUPER_ADMIN: 4,
};

const ROLE_LABEL: Record<string, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  ORG_ADMIN: "Administrator",
  SUPER_ADMIN: "Super Admin",
};

const ROLE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  SUPER_ADMIN: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/20" },
  ORG_ADMIN: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20" },
  TEACHER: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
  STUDENT: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
};

type RoleFilter = "ALL" | "TEACHER" | "STUDENT" | "ORG_ADMIN" | "SUPER_ADMIN";

export default function UserRoleTable({
  initialUsers,
  currentUserId,
  currentRole,
}: {
  initialUsers: AdminUserRow[];
  currentUserId: string;
  currentRole: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<RoleFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const callerLevel = ROLE_RANK[currentRole] ?? 0;

  // Counts for Twenty-style filter badges
  const counts = useMemo(() => {
    return {
      ALL: users.length,
      TEACHER: users.filter((u) => u.role === "TEACHER").length,
      STUDENT: users.filter((u) => u.role === "STUDENT").length,
      ORG_ADMIN: users.filter((u) => u.role === "ORG_ADMIN" || u.role === "SUPER_ADMIN").length,
    };
  }, [users]);

  // Filtered rows
  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      // Role filter
      if (activeFilter === "TEACHER" && u.role !== "TEACHER") return false;
      if (activeFilter === "STUDENT" && u.role !== "STUDENT") return false;
      if (activeFilter === "ORG_ADMIN" && u.role !== "ORG_ADMIN" && u.role !== "SUPER_ADMIN") return false;

      // Search filter
      if (!q) return true;
      return (
        (u.name && u.name.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.toLowerCase().includes(q))
      );
    });
  }, [users, search, activeFilter]);

  async function updateRole(userId: string, nextRole: AdminUserRow["role"]) {
    setError(null);
    setSuccess(null);
    setPendingId(userId);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update role.");

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u))
      );
      setSuccess(`Updated role to ${ROLE_LABEL[nextRole]}!`);
      setTimeout(() => setSuccess(null), 3000);
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err.message || "Failed to update role.");
    } finally {
      setPendingId(null);
    }
  }

  function getInitials(name: string | null, email: string) {
    if (name) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  }

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards (Twenty CRM Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xs">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Total Users
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">{counts.ALL}</div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xs">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Teachers
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {counts.TEACHER}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xs">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Students
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {counts.STUDENT}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xs">
          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            Admins
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {counts.ORG_ADMIN}
          </div>
        </div>
      </div>

      {/* Action Banners */}
      {error && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
          ✕ {error}
        </div>
      )}
      {success && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 animate-fadeIn">
          ✓ {success}
        </div>
      )}

      {/* Twenty CRM Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] self-start">
          <button
            type="button"
            onClick={() => setActiveFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeFilter === "ALL"
                ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            All <span className="text-[10px] opacity-70 ml-0.5">({counts.ALL})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("TEACHER")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeFilter === "TEACHER"
                ? "bg-[var(--bg-elevated)] text-emerald-600 dark:text-emerald-400 shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Teachers <span className="text-[10px] opacity-70 ml-0.5">({counts.TEACHER})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("STUDENT")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeFilter === "STUDENT"
                ? "bg-[var(--bg-elevated)] text-amber-600 dark:text-amber-400 shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Students <span className="text-[10px] opacity-70 ml-0.5">({counts.STUDENT})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("ORG_ADMIN")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeFilter === "ORG_ADMIN"
                ? "bg-[var(--bg-elevated)] text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Admins <span className="text-[10px] opacity-70 ml-0.5">({counts.ORG_ADMIN})</span>
          </button>
        </div>

        {/* Real-time Search Box */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search users (name, email, phone)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
          />
          <span className="absolute left-3 top-2.5 text-xs text-[var(--text-tertiary)]">🔍</span>
        </div>
      </div>

      {/* Twenty CRM User Table */}
      <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-primary)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="px-5 py-3.5">User</th>
                <th className="px-4 py-3.5">Contact / Timezone</th>
                <th className="px-4 py-3.5">Role & Access</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs">
              {visibleUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                const targetLevel = ROLE_RANK[u.role] ?? 0;
                const outranksMe = targetLevel >= callerLevel && !isSelf;
                const locked = isSelf || outranksMe || pendingId === u.id;
                const roleBadge = ROLE_STYLES[u.role] || ROLE_STYLES.STUDENT;

                return (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition">
                    {/* User Info */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/30 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-xs border border-emerald-500/30 shrink-0">
                          {getInitials(u.name, u.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-[var(--text-primary)] truncate">
                            {u.name || "Unnamed User"}
                            {isSelf && (
                              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/10 text-[var(--text-secondary)]">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Contact & Timezone */}
                    <td className="px-4 py-3.5">
                      <div className="text-[var(--text-primary)] font-medium">
                        {u.phone || "No phone added"}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        🌍 {u.timezone || "UTC"}
                      </div>
                    </td>

                    {/* Role Dropdown */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <select
                          value={u.role}
                          onChange={(e) => updateRole(u.id, e.target.value as AdminUserRow["role"])}
                          disabled={locked}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${roleBadge.bg} ${roleBadge.text} ${roleBadge.border} focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                          {Object.keys(ROLE_LABEL)
                            .filter((r) => ROLE_RANK[r] <= callerLevel || r === u.role)
                            .map((r) => (
                              <option key={r} value={r} className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                        </select>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right">
                      {u.role === "TEACHER" ? (
                        <Link
                          href={`/dashboard/teacher/availability?teacherId=${u.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition"
                        >
                          Edit 24h Hours →
                        </Link>
                      ) : (
                        <span className="text-[11px] text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {visibleUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">
                    No users found matching &quot;{search}&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
