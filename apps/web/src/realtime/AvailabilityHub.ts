import type {
  ClientRealtimeMessage,
  RealtimeClaims,
  SchedulingEventMessage,
  ServerRealtimeMessage,
} from './protocol';
import { verifyRealtimeTicket } from '@/lib/realtime/ticket';

declare const WebSocketPair: any;

type SocketAttachment = RealtimeClaims & {
  subscription: string | null;
  foreground: boolean;
  lastSeen: number;
};

export interface HubSocket extends WebSocket {
  serializeAttachment(value: SocketAttachment): void;
  deserializeAttachment(): SocketAttachment;
}

export interface HubState {
  acceptWebSocket(socket: HubSocket): void;
  getWebSockets(): HubSocket[];
  storage: {
    setAlarm(time: number): Promise<void>;
  };
}

const HEARTBEAT_TTL_MS = 60_000;

export class AvailabilityHub {
  private orgId: string | null = null;

  constructor(
    private readonly state: HubState,
    private readonly env?: { REALTIME_SECRET?: string; [key: string]: any }
  ) {}

  private getSecret(): string {
    return this.env?.REALTIME_SECRET || process.env.REALTIME_SECRET || 'novicetutor-realtime-secret';
  }

  setOrgId(orgId: string) {
    this.orgId = orgId;
  }

  getOrgId(): string | null {
    return this.orgId;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // 1. Service-authenticated publish endpoint
    if (request.method === 'POST' && url.pathname === '/publish') {
      const authHeader = request.headers.get('Authorization');
      const expectedAuth = `Bearer ${this.getSecret()}`;
      if (!authHeader || authHeader !== expectedAuth) {
        return new Response('Unauthorized', { status: 401 });
      }

      const event = (await request.json()) as SchedulingEventMessage;
      if (!event || !event.eventId || !event.orgId || !event.type) {
        return new Response('Bad Request: invalid event schema', { status: 400 });
      }

      if (this.orgId && event.orgId !== this.orgId) {
        return new Response('Forbidden: event orgId does not match partitioned hub', { status: 403 });
      }

      if (!this.orgId) {
        this.orgId = event.orgId;
      }

      this.broadcastEvent(event);
      return new Response(null, { status: 204 });
    }

    // 2. WebSocket connection endpoint
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }

    // Never trust raw X-Realtime-Claims. Verify signed cryptographic ticket.
    const ticket =
      url.searchParams.get('ticket') ||
      request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ||
      request.headers.get('Sec-WebSocket-Protocol')?.split(',')[0]?.trim();

    if (!ticket) {
      return new Response('Unauthorized: missing realtime ticket', { status: 401 });
    }

    let claims: RealtimeClaims;
    try {
      claims = await verifyRealtimeTicket(ticket, this.getSecret());
    } catch {
      return new Response('Unauthorized: invalid or expired ticket', { status: 401 });
    }

    if (!claims.userId || !claims.orgId || !claims.role) {
      return new Response('Unauthorized: malformed ticket claims', { status: 401 });
    }

    // Enforce tenant boundary: this Hub instance belongs to a single orgId
    if (this.orgId && claims.orgId !== this.orgId) {
      return new Response('Forbidden: claims orgId does not match partitioned hub', { status: 403 });
    }

    if (!this.orgId) {
      this.orgId = claims.orgId;
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as HubSocket;

    server.serializeAttachment({
      ...claims,
      subscription: null,
      foreground: true,
      lastSeen: Date.now(),
    });

    this.state.acceptWebSocket(server);
    await this.state.storage.setAlarm(Date.now() + HEARTBEAT_TTL_MS);

    server.send(JSON.stringify({ type: 'ready' } satisfies ServerRealtimeMessage));
    this.sendPresenceSnapshot(server);
    if (claims.teacherId) this.broadcastPresence(claims.teacherId);

    try {
      return new Response(null, { status: 101, webSocket: client } as any);
    } catch {
      // In Node.js / non-Workers environments, standard Response constructor rejects status 101.
      return { status: 101, webSocket: client } as unknown as Response;
    }
  }

  async webSocketMessage(socket: HubSocket, value: string | ArrayBuffer) {
    if (typeof value !== 'string') return;
    let message: ClientRealtimeMessage;
    try {
      message = JSON.parse(value) as ClientRealtimeMessage;
    } catch {
      return;
    }

    const attachment = socket.deserializeAttachment();

    if (message.type === 'subscribe') {
      // Validate subscription: a teacher can only subscribe to their own teacherId or null
      if (
        message.teacherId &&
        attachment.role === 'TEACHER' &&
        attachment.teacherId &&
        message.teacherId !== attachment.teacherId
      ) {
        socket.send(
          JSON.stringify({
            type: 'error',
            message: 'Cannot subscribe to another teacher.',
          } satisfies ServerRealtimeMessage)
        );
        return;
      }
      attachment.subscription = message.teacherId;
    }

    if (message.type === 'presence') {
      attachment.foreground = message.foreground;
    }

    if (message.type === 'resync') {
      socket.send(JSON.stringify({ type: 'resync.required' } satisfies ServerRealtimeMessage));
    }

    attachment.lastSeen = Date.now();
    socket.serializeAttachment(attachment);

    if (attachment.teacherId) {
      this.broadcastPresence(attachment.teacherId);
    }
    await this.state.storage.setAlarm(Date.now() + HEARTBEAT_TTL_MS);
  }

  webSocketClose(socket: HubSocket) {
    const attachment = socket.deserializeAttachment?.();
    const teacherId = attachment?.teacherId;
    if (teacherId) this.broadcastPresence(teacherId, socket);
  }

  webSocketError(socket: HubSocket) {
    this.webSocketClose(socket);
  }

  async alarm() {
    const now = Date.now();
    let hasLiveSocket = false;
    const teacherIds = new Set<string>();
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment.teacherId) teacherIds.add(attachment.teacherId);
      if (attachment.foreground && now - attachment.lastSeen <= HEARTBEAT_TTL_MS) {
        hasLiveSocket = true;
      }
    }
    teacherIds.forEach((teacherId) => this.broadcastPresence(teacherId));
    if (hasLiveSocket) await this.state.storage.setAlarm(now + HEARTBEAT_TTL_MS);
  }

  private broadcastEvent(event: SchedulingEventMessage) {
    const payload = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      // Deliver to sockets subscribed to this teacher or to all org events
      if (!attachment.subscription || attachment.subscription === event.teacherId) {
        socket.send(payload);
      }
    }
  }

  private teacherOnline(teacherId: string, excluded?: HubSocket) {
    const now = Date.now();
    return this.state.getWebSockets().some((socket) => {
      if (socket === excluded) return false;
      const attachment = socket.deserializeAttachment();
      return (
        attachment.teacherId === teacherId &&
        attachment.foreground &&
        now - attachment.lastSeen <= HEARTBEAT_TTL_MS
      );
    });
  }

  private broadcastPresence(teacherId: string, excluded?: HubSocket) {
    const payload = JSON.stringify({
      type: 'presence.changed',
      teacherId,
      online: this.teacherOnline(teacherId, excluded),
    } satisfies ServerRealtimeMessage);
    this.state.getWebSockets().forEach((socket) => socket.send(payload));
  }

  private sendPresenceSnapshot(socket: HubSocket) {
    const teachers: Record<string, boolean> = {};
    for (const current of this.state.getWebSockets()) {
      const teacherId = current.deserializeAttachment().teacherId;
      if (teacherId) teachers[teacherId] = this.teacherOnline(teacherId);
    }
    socket.send(JSON.stringify({ type: 'presence.snapshot', teachers } satisfies ServerRealtimeMessage));
  }
}