import type {
  ClientRealtimeMessage,
  RealtimeClaims,
  SchedulingEventMessage,
  ServerRealtimeMessage,
} from './protocol';

declare const WebSocketPair: any;

type SocketAttachment = RealtimeClaims & {
  subscription: string | null;
  foreground: boolean;
  lastSeen: number;
};

interface HubSocket extends WebSocket {
  serializeAttachment(value: SocketAttachment): void;
  deserializeAttachment(): SocketAttachment;
}

interface HubState {
  acceptWebSocket(socket: HubSocket): void;
  getWebSockets(): HubSocket[];
  storage: {
    setAlarm(time: number): Promise<void>;
  };
}

const HEARTBEAT_TTL_MS = 60_000;

export class AvailabilityHub {
  constructor(private readonly state: HubState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/publish') {
      const event = (await request.json()) as SchedulingEventMessage;
      this.broadcastEvent(event);
      return new Response(null, { status: 204 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }

    const claims = JSON.parse(request.headers.get('X-Realtime-Claims') || 'null') as RealtimeClaims | null;
    if (!claims?.userId || !claims.orgId || !claims.role) return new Response('Unauthorized', { status: 401 });

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
    return new Response(null, { status: 101, webSocket: client } as any);
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
    if (message.type === 'subscribe') attachment.subscription = message.teacherId;
    if (message.type === 'presence') attachment.foreground = message.foreground;
    attachment.lastSeen = Date.now();
    socket.serializeAttachment(attachment);
    if (attachment.teacherId) this.broadcastPresence(attachment.teacherId);
    await this.state.storage.setAlarm(Date.now() + HEARTBEAT_TTL_MS);
  }

  webSocketClose(socket: HubSocket) {
    const teacherId = socket.deserializeAttachment().teacherId;
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
      if (attachment.foreground && now - attachment.lastSeen <= HEARTBEAT_TTL_MS) hasLiveSocket = true;
    }
    teacherIds.forEach((teacherId) => this.broadcastPresence(teacherId));
    if (hasLiveSocket) await this.state.storage.setAlarm(now + HEARTBEAT_TTL_MS);
  }

  private broadcastEvent(event: SchedulingEventMessage) {
    const payload = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (!attachment.subscription || attachment.subscription === event.teacherId) socket.send(payload);
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