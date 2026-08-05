'use client';

/**
 * Notification Banner — polls for "meeting started" and "new message"
 * notifications.
 *
 * No real-time transport (websocket/SSE/push) exists in this app yet, so
 * this polls a lightweight endpoint on an interval. Only mounted while the
 * dashboard chrome is visible (not on the fullscreen call route).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/notifications/unread");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const next = (data.notifications as NotificationItem[] | undefined)?.find(
          (n) =>
            (n.type === "MEETING_STARTED" || n.type === "NEW_MESSAGE") &&
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
    if (type === "MEETING_STARTED" && sessionId) {
      router.push(`/dashboard/session/${sessionId}`);
    } else if (type === "NEW_MESSAGE") {
      router.push("/dashboard/chat");
    }
  };

  if (!notification) return null;

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
          {notification.type === "NEW_MESSAGE" ? "View Message" : "Join Now"}
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
