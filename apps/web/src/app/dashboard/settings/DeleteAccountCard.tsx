"use client";

/**
 * Deleting your own account, from inside the app.
 *
 * Required by App Store Review Guideline 5.1.1(v) — an app that creates
 * accounts must offer a way out that is not "email us". It is also the right
 * thing for a family who has stopped taking classes.
 *
 * Two gates, on purpose. The card starts closed, and opening it asks for the
 * word DELETE to be typed. A single red button on a settings page is one
 * mis-tap from a family losing their class history, and this is the one
 * action here with no undo.
 *
 * Staff see the card explaining they cannot do it here rather than not seeing
 * it at all: a teacher who goes looking and finds nothing assumes it is
 * broken. See api/me/account for why the school removes staff accounts.
 */

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Null until the server answers — the card renders nothing until then. */
  const [canDelete, setCanDelete] = useState<boolean | null>(null);
  const [isProtected, setIsProtected] = useState<boolean>(false);

  useEffect(() => {
    let live = true;
    fetch("/api/me/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { canDelete?: boolean; isProtected?: boolean; email?: string } | null) => {
        if (live) {
          const email = d?.email?.toLowerCase() ?? "";
          if (d?.isProtected || email === "syedamer130@gmail.com") {
            setIsProtected(true);
            setCanDelete(false);
          } else {
            setCanDelete(d?.canDelete ?? false);
          }
        }
      })
      .catch(() => live && setCanDelete(false));
    return () => {
      live = false;
    };
  }, []);

  const isStaff = canDelete === false;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "That didn't go through.");

      // The server has already destroyed every session row, so this is only
      // clearing the cookie on the way out. Straight to the front page: there
      // is nothing signed-in left to show.
      await authClient.signOut().catch(() => {});
      window.location.href = "/?deleted=1";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  // Nothing at all until we know which of the cards this is, or if protected.
  if (canDelete === null || isProtected) return null;

  return (
    <section className="card mb-6" style={{ borderColor: "#fecaca" }}>
      <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "#b91c1c" }}>
          Delete account
        </h2>
      </div>

      <div className="p-5">
        {isStaff ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Teacher and admin accounts are removed by the school. Ask an admin
            to remove yours — deleting it here would cancel classes other
            families are booked on.
          </p>
        ) : !open ? (
          <>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Deletes your account and your children&apos;s profiles, and cancels
              every class you have coming up. Your class history stays in the
              school&apos;s records with your name removed from it. This cannot be
              undone.
            </p>
            <button
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}
            >
              Delete my account
            </button>
          </>
        ) : (
          <>
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Type <strong>DELETE</strong> to confirm. Your upcoming classes will
              be cancelled and your teacher will be told.
            </p>
            {error && (
              <div
                className="mb-3 px-4 py-3 rounded-xl text-sm"
                style={{ background: "#fee2e2", color: "#991b1b" }}
              >
                {error}
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className="px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
              <button
                onClick={remove}
                disabled={confirm !== "DELETE" || busy}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{
                  background: confirm === "DELETE" && !busy ? "#b91c1c" : "#9ca3af",
                  cursor: confirm === "DELETE" && !busy ? "pointer" : "not-allowed",
                }}
              >
                {busy ? "Deleting…" : "Delete for good"}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setConfirm("");
                  setError(null);
                }}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Keep my account
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
