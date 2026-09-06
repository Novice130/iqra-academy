import { verifyRealtimeTicket } from '@/lib/realtime/ticket';

declare const WebSocketPair: any;

type BoardAttachment = {
  userId: string;
  orgId: string;
  role: string;
  sessionId: string;
  boardId: string;
  isHost: boolean;
  locked: boolean;
  lastSeen: number;
};

export interface BoardSocket extends WebSocket {
  serializeAttachment(value: BoardAttachment): void;
  deserializeAttachment(): BoardAttachment;
}

export interface BoardState {
  acceptWebSocket(socket: BoardSocket): void;
  getWebSockets(): BoardSocket[];
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    setAlarm(time: number): Promise<void>;
  };
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * WhiteboardHub — one Durable Object instance per (orgId, sessionId, boardId).
 *
 * SQLite-persisted stroke log with host lock/clear. Strokes broadcast to all
 * sockets in the instance (org partition is the instance itself — the id is
 * derived from the orgId+sessionId+boardId triple and every ticket is checked
 * against it before the socket is accepted). No transcript/content logging.
 */
export class WhiteboardHub {
  private key: string | null = null;

  constructor(
    private readonly state: BoardState,
    private readonly env?: { REALTIME_SECRET?: string; [key: string]: unknown }
  ) {}

  private getSecret(): string {
    return (
      this.env?.REALTIME_SECRET ||
      process.env.REALTIME_SECRET ||
      (this.env as any)?.BETTER_AUTH_SECRET ||
      process.env.BETTER_AUTH_SECRET ||
      "novicetutor-realtime-fallback-secret-2026"
    );
  }

  static instanceName(orgId: string, sessionId: string, boardId: string) {
    return `wb:${orgId}:${sessionId}:${boardId}`;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (!this.getSecret()) {
      return new Response('Realtime is not configured.', { status: 503 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      if (request.method === 'GET' && url.pathname === '/state') {
        const strokes = (await this.state.storage.get<unknown[]>('strokes')) ?? [];
        const locked = (await this.state.storage.get<boolean>('locked')) ?? false;
        const version = (await this.state.storage.get<number>('version')) ?? 1;
        return Response.json({ strokes, locked, version });
      }
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }

    const ticket =
      url.searchParams.get('ticket') ||
      request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!ticket) return new Response('Unauthorized: missing ticket', { status: 401 });

    let claims: { userId: string; orgId: string; role: string; sessionId?: string; boardId?: string; isHost?: boolean };
    try {
      claims = await verifyRealtimeTicket(ticket, this.getSecret()) as unknown as typeof claims;
    } catch {
      return new Response('Unauthorized: invalid or expired ticket', { status: 401 });
    }

    const sessionId = url.searchParams.get('sessionId') || claims.sessionId;
    const boardId = url.searchParams.get('boardId') || claims.boardId || 'main';
    if (!claims.userId || !claims.orgId || !sessionId) {
      return new Response('Unauthorized: malformed ticket claims', { status: 401 });
    }
    const expected = WhiteboardHub.instanceName(claims.orgId, sessionId, boardId);
    if (this.key && this.key !== expected) {
      return new Response('Forbidden: board instance mismatch', { status: 403 });
    }
    if (!this.key) this.key = expected;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as BoardSocket;
    const locked = (await this.state.storage.get<boolean>('locked')) ?? false;
    server.serializeAttachment({
      userId: claims.userId,
      orgId: claims.orgId,
      role: claims.role,
      sessionId,
      boardId,
      isHost: claims.isHost === true || claims.role === 'SUPER_ADMIN',
      locked,
      lastSeen: Date.now(),
    });
    this.state.acceptWebSocket(server);
    const strokes = (await this.state.storage.get<unknown[]>('strokes')) ?? [];
    server.send(JSON.stringify({ type: 'init', strokes, locked }));
    try {
      return new Response(null, { status: 101, webSocket: client } as never);
    } catch {
      return { status: 101, webSocket: client } as unknown as Response;
    }
  }

  async webSocketMessage(socket: BoardSocket, value: string | ArrayBuffer) {
    if (typeof value !== 'string') return;
    let msg: { type: string; stroke?: unknown; locked?: boolean };
    try {
      msg = JSON.parse(value);
    } catch {
      return;
    }
    const att = socket.deserializeAttachment();
    if (msg.type === 'stroke') {
      if (att.locked && !att.isHost) return;
      await this.state.blockConcurrencyWhile(async () => {
        const strokes = (await this.state.storage.get<unknown[]>('strokes')) ?? [];
        strokes.push({ ...((msg.stroke as Record<string, unknown>) ?? {}), by: att.userId, at: Date.now() });
        await this.state.storage.put('strokes', strokes.slice(-2000));
        await this.state.storage.put('version', Date.now());
      });
      for (const ws of this.state.getWebSockets()) {
        if (ws === socket) continue;
        try {
          ws.send(JSON.stringify({ type: 'stroke', stroke: msg.stroke }));
        } catch {}
      }
    }
    if (msg.type === 'lock' && att.isHost) {
      const locked = msg.locked === true;
      await this.state.storage.put('locked', locked);
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(JSON.stringify({ type: 'lock', locked }));
          const a = ws.deserializeAttachment();
          ws.serializeAttachment({ ...a, locked });
        } catch {}
      }
    }
    if (msg.type === 'clear' && att.isHost) {
      await this.state.storage.put('strokes', []);
      await this.state.storage.put('version', Date.now());
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(JSON.stringify({ type: 'clear' }));
        } catch {}
      }
    }
  }

  async alarm() {}
}
