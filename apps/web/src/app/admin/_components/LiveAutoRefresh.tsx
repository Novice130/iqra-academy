"use client";

/**
 * @fileoverview Re-renders the live page's server data on an interval.
 *
 * LiveKit has no push channel into this page, so the cheapest honest refresh
 * is `router.refresh()` every 30 seconds. It skips ticks while the tab is
 * hidden (a backgrounded tab would otherwise hit LiveKit forever) and catches
 * up as soon as the tab is visible again.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function LiveAutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    last.current = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      last.current = Date.now();
    };
    const id = window.setInterval(tick, seconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > seconds * 1000) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return (
    <span className="text-xs text-[var(--text-tertiary)]" aria-live="off">
      Refreshes every {seconds} seconds
    </span>
  );
}
