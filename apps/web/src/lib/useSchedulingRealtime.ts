'use client';

/**
 * @fileoverview Client Realtime Scheduling Hook
 *
 * Connects to the partitioned AvailabilityHub over WebSocket with signed JWT tickets.
 * Handles automatic reconnects with capped backoff, visibility-aware heartbeats,
 * event deduplication, query invalidation callbacks, and a slow polling safety fallback.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  ClientRealtimeMessage,
  SchedulingEventMessage,
  ServerRealtimeMessage,
} from '@/realtime/protocol';

export interface UseSchedulingRealtimeOptions {
  teacherId?: string | null;
  enabled?: boolean;
  onAvailabilityChanged?: (event: SchedulingEventMessage) => void;
  onTimeOffChanged?: (event: SchedulingEventMessage) => void;
  onBookingChanged?: (event: SchedulingEventMessage) => void;
  onSessionChanged?: (event: SchedulingEventMessage) => void;
  onClassLive?: (event: SchedulingEventMessage) => void;
  onClassEnded?: (event: SchedulingEventMessage) => void;
  onResyncRequired?: () => void;
  onPresenceChanged?: (presence: { teacherId: string; online: boolean }) => void;
  onPresenceSnapshot?: (teachers: Record<string, boolean>) => void;
}

export interface SchedulingRealtimeState {
  connected: boolean;
  onlineTeachers: Record<string, boolean>;
  lastEvent: SchedulingEventMessage | null;
  resync: () => void;
}

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 30000;
const CONNECTED_SAFETY_POLL_MS = 60000;
const DISCONNECTED_POLL_MS = 15000;

export function useSchedulingRealtime(
  options: UseSchedulingRealtimeOptions = {}
): SchedulingRealtimeState {
  const {
    teacherId = null,
    enabled = true,
    onAvailabilityChanged,
    onTimeOffChanged,
    onBookingChanged,
    onSessionChanged,
    onClassLive,
    onClassEnded,
    onResyncRequired,
    onPresenceChanged,
    onPresenceSnapshot,
  } = options;

  const [connected, setConnected] = useState(false);
  const [onlineTeachers, setOnlineTeachers] = useState<Record<string, boolean>>({});
  const [lastEvent, setLastEvent] = useState<SchedulingEventMessage | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(MIN_BACKOFF_MS);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReconnectRef = useRef<() => void>(() => {});
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const hasConnectedOnceRef = useRef(false);

  // Keep latest callbacks in refs to avoid socket teardown on function identity changes
  const callbacksRef = useRef({
    onAvailabilityChanged,
    onTimeOffChanged,
    onBookingChanged,
    onSessionChanged,
    onClassLive,
    onClassEnded,
    onResyncRequired,
    onPresenceChanged,
    onPresenceSnapshot,
  });

  useEffect(() => {
    callbacksRef.current = {
      onAvailabilityChanged,
      onTimeOffChanged,
      onBookingChanged,
      onSessionChanged,
      onClassLive,
      onClassEnded,
      onResyncRequired,
      onPresenceChanged,
      onPresenceSnapshot,
    };
  }, [
    onAvailabilityChanged,
    onTimeOffChanged,
    onBookingChanged,
    onSessionChanged,
    onClassLive,
    onClassEnded,
    onResyncRequired,
    onPresenceChanged,
    onPresenceSnapshot,
  ]);

  const triggerResync = useCallback(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    callbacksRef.current.onResyncRequired?.();
  }, []);

  const sendMessage = useCallback((msg: ClientRealtimeMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Subscribe to changes when teacherId changes
  useEffect(() => {
    if (connected) {
      sendMessage({ type: 'subscribe', teacherId });
    }
  }, [teacherId, connected, sendMessage]);

  const connect = useCallback(async () => {
    if (!enabled || typeof window === 'undefined') return;

    try {
      // 1. Obtain signed ticket
      const ticketRes = await fetch('/api/realtime/ticket', {
        method: 'POST',
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!ticketRes.ok) {
        throw new Error(`Failed to obtain ticket: ${ticketRes.status}`);
      }
      const { ticket } = (await ticketRes.json()) as { ticket: string };
      if (!ticket) throw new Error('Missing ticket in response');

      // 2. Open WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/realtime/ws?ticket=${encodeURIComponent(ticket)}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        backoffRef.current = MIN_BACKOFF_MS;

        // If reconnecting after a dropped connection, request full resync
        if (hasConnectedOnceRef.current) {
          triggerResync();
        }
        hasConnectedOnceRef.current = true;

        // Subscribe to relevant teacher scope
        sendMessage({ type: 'subscribe', teacherId });
        sendMessage({ type: 'presence', foreground: !document.hidden });
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerRealtimeMessage;
          if (msg.type === 'ready') {
            return;
          }

          if (msg.type === 'resync.required') {
            triggerResync();
            return;
          }

          if (msg.type === 'presence.snapshot') {
            setOnlineTeachers(msg.teachers);
            callbacksRef.current.onPresenceSnapshot?.(msg.teachers);
            return;
          }

          if (msg.type === 'presence.changed') {
            setOnlineTeachers((prev) => ({
              ...prev,
              [msg.teacherId]: msg.online,
            }));
            callbacksRef.current.onPresenceChanged?.({
              teacherId: msg.teacherId,
              online: msg.online,
            });
            return;
          }

          // Scheduling Event Message
          const scheduleMsg = msg as SchedulingEventMessage;
          if (scheduleMsg.eventId) {
            // Deduplicate by eventId
            if (seenEventsRef.current.has(scheduleMsg.eventId)) {
              return;
            }
            seenEventsRef.current.add(scheduleMsg.eventId);
            if (seenEventsRef.current.size > 500) {
              // Cap memory footprint of deduplication set
              const first = seenEventsRef.current.values().next().value;
              if (first) seenEventsRef.current.delete(first);
            }

            setLastEvent(scheduleMsg);

            switch (scheduleMsg.type) {
              case 'availability.changed':
                callbacksRef.current.onAvailabilityChanged?.(scheduleMsg);
                break;
              case 'time_off.changed':
                callbacksRef.current.onTimeOffChanged?.(scheduleMsg);
                break;
              case 'booking.created':
              case 'booking.cancelled':
                callbacksRef.current.onBookingChanged?.(scheduleMsg);
                break;
              case 'session.changed':
                callbacksRef.current.onSessionChanged?.(scheduleMsg);
                break;
              case 'class.live':
                callbacksRef.current.onClassLive?.(scheduleMsg);
                break;
              case 'class.ended':
                callbacksRef.current.onClassEnded?.(scheduleMsg);
                break;
            }
          }
        } catch (err) {
          console.warn('Realtime message parse error:', err);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        scheduleReconnectRef.current();
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch {
      setConnected(false);
      scheduleReconnectRef.current();
    }
  }, [enabled, teacherId, triggerResync, sendMessage]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    const delay = backoffRef.current + Math.floor(Math.random() * 500);
    backoffRef.current = Math.min(backoffRef.current * 1.5, MAX_BACKOFF_MS);
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  // Initial connection
  useEffect(() => {
    if (!enabled) return;
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [enabled, connect]);

  // Heartbeat & visibility listener
  useEffect(() => {
    if (!enabled) return;

    // Heartbeat every 30s when connected
    heartbeatIntervalRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden && connected) {
        sendMessage({ type: 'heartbeat' });
      }
    }, HEARTBEAT_INTERVAL_MS);

    const onVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      if (connected) {
        sendMessage({ type: 'presence', foreground: isVisible });
      }
      // On resume from background: immediate resync fetch
      if (isVisible) {
        if (!connected) {
          connect();
        }
        triggerResync();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, connected, sendMessage, connect, triggerResync]);

  // Safety Polling Fallback
  // - Realtime connected: slow safety resync (60s)
  // - Disconnected: faster polling fallback (15s)
  // - Never poll while hidden
  useEffect(() => {
    if (!enabled) return;

    const intervalMs = connected ? CONNECTED_SAFETY_POLL_MS : DISCONNECTED_POLL_MS;
    safetyPollIntervalRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      triggerResync();
    }, intervalMs);

    return () => {
      if (safetyPollIntervalRef.current) clearInterval(safetyPollIntervalRef.current);
    };
  }, [enabled, connected, triggerResync]);

  return {
    connected,
    onlineTeachers,
    lastEvent,
    resync: triggerResync,
  };
}
