'use client';

/**
 * @fileoverview Teacher Availability Changed Informational Modal
 *
 * Appears when an admin modifies a teacher's schedule.
 * Displays before/after slot diff. Teacher acknowledges only (no accept/reject).
 * Acknowledging sets isRead = true on the notification, so it appears once only.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSchedulingRealtime } from '@/lib/useSchedulingRealtime';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface SlotDiff {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone?: string;
}

interface AvailabilityPayload {
  actorName?: string;
  teacherId?: string;
  before?: SlotDiff[];
  after?: SlotDiff[];
  changedAt?: string;
}

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  payload?: AvailabilityPayload | null;
  createdAt: string;
}

function formatSlots(slots?: SlotDiff[]) {
  if (!slots || slots.length === 0) {
    return <span className="text-xs text-neutral-400 italic">No available hours set</span>;
  }

  // Sort by dayOfWeek, then startTime
  const sorted = [...slots].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  return (
    <ul className="space-y-1 text-xs">
      {sorted.map((s, idx) => (
        <li key={idx} className="flex justify-between py-1 border-b border-white/10 last:border-0">
          <span className="font-medium text-neutral-300">{DAYS[s.dayOfWeek] || `Day ${s.dayOfWeek}`}</span>
          <span className="text-neutral-400">
            {s.startTime} – {s.endTime}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function TeacherAvailabilityModal() {
  const [notification, setNotification] = useState<NotificationItem | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const dismissedIds = useRef<Set<string>>(new Set());

  const checkNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread', {
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const notifs = (data.notifications as NotificationItem[] | undefined) || [];
      const changeNotif = notifs.find(
        (n) => n.type === 'AVAILABILITY_CHANGED' && !dismissedIds.current.has(n.id)
      );
      setNotification(changeNotif || null);
    } catch {
      // Best-effort
    }
  }, []);

  useEffect(() => {
    checkNotifications();
  }, [checkNotifications]);

  useSchedulingRealtime({
    onAvailabilityChanged: () => {
      checkNotifications();
    },
    onResyncRequired: () => {
      checkNotifications();
    },
  });

  const handleAcknowledge = async () => {
    if (!notification) return;
    setAcknowledging(true);
    dismissedIds.current.add(notification.id);
    try {
      await fetch(`/api/notifications/${notification.id}/read`, {
        method: 'POST',
      });
    } catch {
      // Best-effort
    } finally {
      setAcknowledging(false);
      setNotification(null);
    }
  };

  if (!notification) return null;

  const payload = notification.payload;
  const actorName = payload?.actorName || 'An administrator';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="availability-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 shadow-2xl border text-white"
        style={{
          background: 'rgba(28, 32, 40, 0.85)',
          borderColor: 'rgba(255, 255, 255, 0.16)',
          backdropFilter: 'blur(24px)',
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2 bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Schedule Notice
            </span>
            <h2 id="availability-modal-title" className="text-xl font-semibold text-white">
              Availability Schedule Updated
            </h2>
            <p className="text-sm text-neutral-300 mt-1">
              {actorName} updated your weekly availability schedule.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
          <div className="rounded-xl p-3.5 bg-black/30 border border-white/10">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Previous Schedule
            </h3>
            <div className="max-h-48 overflow-y-auto pr-1">
              {formatSlots(payload?.before)}
            </div>
          </div>

          <div className="rounded-xl p-3.5 bg-blue-950/20 border border-blue-500/20">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-300 mb-2">
              New Schedule
            </h3>
            <div className="max-h-48 overflow-y-auto pr-1">
              {formatSlots(payload?.after)}
            </div>
          </div>
        </div>

        <p className="text-xs text-neutral-400 mb-6 italic">
          This is an informational notice. The updated schedule takes effect immediately.
        </p>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-sm text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            style={{
              background: '#0A84FF',
            }}
          >
            {acknowledging ? 'Acknowledging...' : 'Acknowledge'}
          </button>
        </div>
      </div>
    </div>
  );
}
