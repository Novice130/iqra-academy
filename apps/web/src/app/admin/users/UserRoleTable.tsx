"use client";

/**
 * The role-change table.
 *
 * Optimistic, with a revert on failure: a role dropdown that sits there doing
 * nothing for a second reads as broken, but one that lies about the result is
 * worse — so a rejected change snaps back and says why.
 *
 * Demotions ask for confirmation. Promotions do not: granting is recoverable
 * by demoting, whereas taking someone's access away mid-term is the change
 * somebody makes by mis-clicking a dropdown.
 *
 * Inline styles throughout, matching the rest of /admin, which does not use
 * the dashboard's Tailwind theme.
 */

import { useMemo, useState } from "react";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  phone: string | null;
  timezone: string | null;
  createdAt: string;
}

const ROLE_RANK: Record<string, number> = {
  STUDENT: 0,
  TEACHER: 1,
  ORG_ADMIN: 2,
  SUPER_ADMIN: 3,
};

const ROLE_LABEL: Record<string, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  ORG_ADMIN: "Admin",
  SUPER_ADMIN: "Super admin",
};

export default function UserRoleTable({
  initialUsers,
  currentUserId,
  currentRole,
}: {
  initialUsers: AdminUserRow[];
  currentUserId: string;
  currentRole: string;
}) {
  const [rows, setRows] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  const callerLevel = ROLE_RANK[currentRole] ?? 0;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    });
  }, [rows, search, roleFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of rows) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [rows]);

  async function changeRole(user: AdminUserRow, nextRole: string) {
    if (nextRole === user.role) return;

    if (ROLE_RANK[nextRole] < ROLE_RANK[user.role]) {
      const ok = window.confirm(
        `Change ${user.name || user.email} from ${ROLE_LABEL[user.role]} to ${ROLE_LABEL[nextRole]}?\n\n` +
          `They will immediately lose access to everything the ${ROLE_LABEL[user.role].toLowerCase()} role gives them.`
      );
      if (!ok) return;
    }

    const previous = user.role;
    setBusyId(user.id);
    setMessage(null);
    setRows((rs) => rs.map((r) => (r.id === user.id ? { ...r, role: nextRole } : r)));

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: nextRole }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "That change didn't go through.");

      setMessage({
        text:
          nextRole === "TEACHER"
            ? `${user.name || user.email} is now a teacher, and has been asked to set their hours.`
            : `${user.name || user.email} is now ${ROLE_LABEL[nextRole].toLowerCase()}.`,
        bad: false,
      });
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === user.id ? { ...r, role: previous } : r)));
      setMessage({ text: err instanceof Error ? err.message : "Something went wrong.", bad: true });
    } finally {
      setBusyId(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#e2e8f0",
    borderRadius: "8px",
    padding: "9px 12px",
    fontSize: "14px",
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#94a3b8",
    borderBottom: "1px solid #334155",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "12px",
    borderBottom: "1px solid #1e293b",
    fontSize: "14px",
    verticalAlign: "middle",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
          style={{ ...inputStyle, flex: "1 1 240px", minWidth: 0 }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={inputStyle}
        >
          <option value="">Everyone ({rows.length})</option>
          {Object.keys(ROLE_LABEL).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]} ({counts[r] ?? 0})
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div
          style={{
            marginBottom: "16px",
            padding: "11px 14px",
            borderRadius: "8px",
            fontSize: "14px",
            background: message.bad ? "#7f1d1d" : "#065f46",
            color: message.bad ? "#fecaca" : "#a7f3d0",
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ overflowX: "auto", background: "#111c33", borderRadius: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Time zone</th>
              <th style={th}>Role</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => {
              const isSelf = u.id === currentUserId;
              // Mirrors the server's ceiling so the UI doesn't offer a change
              // the API will refuse.
              const outranksMe = ROLE_RANK[u.role] > callerLevel;
              const locked = isSelf || outranksMe || busyId === u.id;

              return (
                <tr key={u.id}>
                  <td style={td}>
                    {u.name || <span style={{ color: "#64748b" }}>No name</span>}
                    {isSelf && (
                      <span style={{ color: "#64748b", fontSize: "12px" }}> · you</span>
                    )}
                  </td>
                  <td style={{ ...td, color: "#94a3b8" }}>{u.email}</td>
                  <td style={td}>
                    {u.timezone || (
                      <span
                        style={{ color: u.role === "TEACHER" ? "#fbbf24" : "#64748b" }}
                        title={
                          u.role === "TEACHER"
                            ? "A teacher with no time zone can't publish usable hours."
                            : undefined
                        }
                      >
                        {u.role === "TEACHER" ? "Not set ⚠" : "Not set"}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    <select
                      value={u.role}
                      disabled={locked}
                      onChange={(e) => changeRole(u, e.target.value)}
                      style={{
                        ...inputStyle,
                        padding: "7px 10px",
                        opacity: locked ? 0.5 : 1,
                        cursor: locked ? "not-allowed" : "pointer",
                      }}
                      title={
                        isSelf
                          ? "You can't change your own role — ask another admin."
                          : outranksMe
                            ? "This person outranks you."
                            : undefined
                      }
                    >
                      {Object.keys(ROLE_LABEL)
                        .filter((r) => ROLE_RANK[r] <= callerLevel || r === u.role)
                        .map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {u.role === "TEACHER" && (
                      <a
                        href={`/dashboard/teacher/availability?teacherId=${u.id}`}
                        style={{ color: "#34d399", textDecoration: "none", fontSize: "13px" }}
                      >
                        Hours →
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td style={{ ...td, color: "#64748b", textAlign: "center" }} colSpan={5}>
                  Nobody matches that.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
