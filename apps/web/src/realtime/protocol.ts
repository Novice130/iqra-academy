import type { UserRole } from '@/lib/rbac';

export type SchedulingEventType =
  | 'availability.changed'
  | 'time_off.changed'
  | 'booking.created'
  | 'booking.cancelled'
  | 'session.changed'
  | 'class.live'
  | 'class.ended';

export interface SchedulingEventMessage {
  eventId: string;
  orgId: string;
  teacherId: string;
  actorId: string;
  type: SchedulingEventType;
  aggregateId: string | null;
  committedAt: string;
  version: number;
}

export interface RealtimeClaims {
  userId: string;
  orgId: string;
  role: UserRole;
  teacherId: string | null;
}

export type ClientRealtimeMessage =
  | { type: 'subscribe'; teacherId: string | null }
  | { type: 'presence'; foreground: boolean }
  | { type: 'heartbeat' }
  | { type: 'resync' };

export type ServerRealtimeMessage =
  | { type: 'ready' }
  | SchedulingEventMessage
  | { type: 'presence.snapshot'; teachers: Record<string, boolean> }
  | { type: 'presence.changed'; teacherId: string; online: boolean }
  | { type: 'resync.required' }
  | { type: 'error'; message: string };
