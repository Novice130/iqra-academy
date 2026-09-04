'use client';

/**
 * Notification Banner — in-app notifications banner for chat messages,
 * trial classes, and system updates.
 *
 * NOTE: Live classes are handled exclusively by LiveClassRibbon (which is
 * persistent, linked to the live session, and avoids duplicate banners).
 * Desktop OS notifications for MEETING_STARTED are still announced via
 * desktopNotify for Electron users when the app is minimized.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { desktopNotify } from "@/lib/desktop";

const POLL_INTERVAL_MS = 20000;

interface NotificationItem {
  id: string;
  type: string;
  sessionId: string | null;
  message: string;
}

export default function MeetingNotificationBanner() {
  const [notification, setNotification] = useState<NotificationItem | null>(null);
  const router = useRouter();
  const dismissedIds = useRef<Set<string>>(new Set());
  /**
   * Notifications already sent to the OS. The poll returns the same unread
   * row every 20s until it is acted on, and a desktop toast per poll is how
   * an app gets muted for good.
   */
  const announcedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/notifications/unread");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const notifs = (data.notifications as NotificationItem[] | undefined) || [];

        // Desktop toast announcements for any new unread notification (including MEETING_STARTED)
        for (const n of notifs) {
          if (!announcedIds.current.has(n.id)) {
            announcedIds.current.add(n.id);
            const title =
              n.type === "MEETING_STARTED"
                ? "Your class has started"
                : n.type === "NEW_MESSAGE"
                ? "New message"
                : "Notification";
            const path =
              n.type === "MEETING_STARTED" && n.sessionId
                ? `/dashboard/session/${n.sessionId}`
                : n.type === "NEW_MESSAGE"
                ? "/dashboard/chat"
                : undefined;
            desktopNotify(title, n.message, path);
          }
        }

        // Live classes are surfaced by LiveClassRibbon and schedule changes by TeacherAvailabilityModal.
        // Exclude MEETING_STARTED and AVAILABILITY_CHANGED here to avoid duplicate or conflicting banners.
        const next = notifs.find(
          (n) =>
            n.type !== "MEETING_STARTED" &&
            n.type !== "AVAILABILITY_CHANGED" &&
            !dismissedIds.current.has(n.id)
        );
        setNotification(next || null);
      } catch {
        // Silent — this is a best-effort background poll, not critical path.
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const dismiss = async (id: string) => {
    dismissedIds.current.add(id);
    setNotification(null);
    fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  };

  const act = async () => {
    if (!notification) return;
    const { id, sessionId, type } = notification;
    dismissedIds.current.add(id);
    setNotification(null);
    fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
    if (type === "NEW_MESSAGE") {
      router.push("/dashboard/chat");
    } else if (type === "TRIAL_REQUESTED" || type === "TRIAL_CONFIRMED") {
      if (sessionId) router.push(`/dashboard/session/${sessionId}`);
      else router.push("/dashboard");
    } else if (type === "INVOICE_ISSUED") {
      router.push("/dashboard/invoices");
    } else if (sessionId) {
      router.push(`/dashboard/session/${sessionId}`);
    }
  };

  if (!notification) return null;

  const actionLabel =
    notification.type === "NEW_MESSAGE"
      ? "View Message"
      : notification.type === "INVOICE_ISSUED"
      ? "View Invoice"
      : "View";

  return (
    <div
      className="flex items-center justify-between gap-4 px-5 py-3"
      style={{ background: "var(--accent)", color: "white" }}
    >
      <span className="text-sm font-medium">{notification.message}</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={act}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          {actionLabel}
        </button>
        <button
          onClick={() => dismiss(notification.id)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer opacity-80 hover:opacity-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
