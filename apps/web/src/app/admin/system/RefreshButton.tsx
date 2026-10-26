"use client";

/**
 * @fileoverview Re-runs every health probe on /admin/system.
 *
 * The page is force-dynamic, so `router.refresh()` re-renders it on the
 * server and each panel's "checked at" moves forward. The transition keeps
 * the old numbers on screen until the new ones arrive.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { btn } from "../_components/ui";

export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={btn.secondary}
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Checking…" : "Refresh"}
    </button>
  );
}
