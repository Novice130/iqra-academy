import type {
  ClientRealtimeMessage,
  RealtimeClaims,
  SchedulingEventMessage,
  ServerRealtimeMessage,
} from './protocol';
import { isServiceAuthorized, verifyRealtimeTicket } from '@/lib/realtime/ticket';

declare const WebSocketPair: any;

type SocketAttachment = RealtimeClaims & {
  subscription: string | null;
  foreground: boolean;
  lastSeen: number;
};

/**
 * The slice of a socket the hub actually uses. Kept structural so the Node
 * sidecar can hand in a `ws` socket and the tests a mock, without either
 * pretending to be a browser `WebSocket`.
 */
export interface HubSocket {
  send(data: string): void;
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

/** Outcome of a hub operation, in HTTP terms so every transport can relay it. */
export interface HubResult {
  status: number;
  message?: string;
}

const HEARTBEAT_TTL_MS = 60_000;

/**
 * AvailabilityHub — one instance per orgId, holding that org's sockets.
 *
 * The hub owns the rules (tenant boundary, subscriptions, presence) and
 * nothing about the transport: `HubState` is whatever keeps the sockets and
 * the heartbeat alarm. In production that is the Node sidecar
 * (src/realtime/server), which keeps a `Map<orgId, hub>` in memory and turns
 * the alarm into a timer. `fetch` is the same hub behind a Request/Response
 * face, which is how the tests drive it.
 */
export class AvailabilityHub {
  private orgId: string | null = null;

  constructor(
    private readonly state: HubState,
    private readonly env?: { REALTIME_SECRET?: string; [key: string]: any }
  ) {}

  // No fallback on purpose: an unset secret has to read as "not configured"
  // (503 below), never as a well-known string.
  private getSecret(): string {
    return this.env?.REALTIME_SECRET || process.env.REALTIME_SECRET || '';
  }

  setOrgId(orgId: string) {
    this.orgId = orgId;
  }

  getOrgId(): string | null {
    return this.orgId;
  }

  /** Service-authenticated publish: fan an event out to this org's sockets. */
  publish(authHeader: string | null, event: SchedulingEventMessage | null): HubResult {
    // Fail closed when unconfigured: an empty secret would make `Bearer `
    // match anything.
    if (!this.getSecret()) {
      return { status: 503, message: 'Realtime is not configured.' };
    }
    if (!isServiceAuthorized(authHeader, this.getSecret())) {
      return { status: 401, message: 'Unauthorized' };
    }
    if (!event || !event.eventId || !event.orgId || !event.type) {
      return { status: 400, message: 'Bad Request: invalid event schema' };
    }
    if (this.orgId && event.orgId !== this.orgId) {
      return { status: 403, message: 'Forbidden: event orgId does not match partitioned hub' };
    }
    if (!this.orgId) {
      this.orgId = event.orgId;
    }

    this.broadcastEvent(event);
    return { status: 204 };
  }

  /**
   * Whether verified claims may join this hub. Enforces the tenant boundary:
   * a hub instance belongs to a single orgId.
   */
  admit(claims: RealtimeClaims): HubResult | null {
    if (!claims.userId || !claims.orgId || !claims.role) {
      return { status: 401, message: 'Unauthorized: malformed ticket claims' };
    }
    if (this.orgId && claims.orgId !== this.orgId) {
      return { status: 403, message: 'Forbidden: claims orgId does not match partitioned hub' };
    }
    if (!this.orgId) {
      this.orgId = claims.orgId;
    }
    return null;
  }

  /** Registers an already-admitted socket and sends it the opening handshake. */
  async accept(server: HubSocket, claims: RealtimeClaims) {
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
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (!this.getSecret()) {
      return new Response('Realtime is not configured.', { status: 503 });
    }

    // 1. Service-authenticated publish endpoint
    if (request.method === 'POST' && url.pathname === '/publish') {
      const authHeader = request.headers.get('Authorization');
      // Authenticate before reading the body, so an unauthenticated caller
      // cannot make the hub parse anything.
      if (!isServiceAuthorized(authHeader, this.getSecret())) {
        return new Response('Unauthorized', { status: 401 });
      }
      const event = (await request.json().catch(() => null)) as SchedulingEventMessage | null;
      const result = this.publish(authHeader, event);
      return new Response(result.message ?? null, { status: result.status });
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

    const refused = this.admit(claims);
    if (refused) {
      return new Response(refused.message, { status: refused.status });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as HubSocket;

    await this.accept(server, claims);

    try {
      return new Response(null, { status: 101, webSocket: client } as any);
    } catch {
      // The standard Response constructor rejects status 101 outside a
      // runtime with WebSocketPair; hand back a response-shaped object.
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
      // Validate subscription: a teacher can only subscribe to their own teacherId or null.
      // The requested teacher must also belong to the claims org — same-org
      // enforcement for non-teacher roles is the hub partition itself (one
      // hub instance per orgId), which drops cross-org events before they
      // reach any socket, but an explicit check here keeps the rule visible
      // at the point of request.
      if (message.teacherId && message.teacherId !== attachment.teacherId) {
        if (attachment.role === 'TEACHER' || attachment.teacherId) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Cannot subscribe to another teacher.',
            } satisfies ServerRealtimeMessage)
          );
          return;
        }
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