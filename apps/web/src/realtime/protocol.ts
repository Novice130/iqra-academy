import type { UserRole } from '@/lib/rbac';

export type SchedulingEventType =
  | 'availability.changed'
  | 'time_off.changed'
  | 'booking.created'
  | 'booking.cancelled'
  | 'session.changed';

export interface SchedulingEventMessage {
  type: SchedulingEventType;
  eventId: string;
  teacherId: string;
  aggregateId: string | null;
  committedAt: string;
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
  | { type: 'heartbeat' };

export type ServerRealtimeMessage =
  | { type: 'ready' }
  | SchedulingEventMessage
  | { type: 'presence.snapshot'; teachers: Record<string, boolean> }
  | { type: 'presence.changed'; teacherId: string; online: boolean }
  | { type: 'resync.required' };
