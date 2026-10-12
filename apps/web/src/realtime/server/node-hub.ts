/**
 * @fileoverview Node hosting for AvailabilityHub: the `HubState` a hub needs,
 * backed by `ws` sockets and a timer, plus the per-org registry.
 *
 * One process, one registry, so every socket of an org lands in the same hub.
 * That is the whole reason the sidecar must run as a single instance.
 */

import type { WebSocket } from "ws";
import { AvailabilityHub, type HubSocket, type HubState } from "../AvailabilityHub";

type Attachment = Parameters<HubSocket["serializeAttachment"]>[0];

/** A `ws` socket carrying the attachment the hub stores on each connection. */
export type NodeHubSocket = WebSocket & HubSocket;

/**
 * Gives a `ws` socket the attachment accessors the hub expects. The socket
 * itself stays the hub's handle, so identity checks inside the hub (the
 * "everyone but this one" presence broadcast) keep working.
 */
export function toHubSocket(socket: WebSocket): NodeHubSocket {
  let attachment: Attachment | null = null;
  return Object.assign(socket, {
    serializeAttachment(value: Attachment) {
      attachment = value;
    },
    deserializeAttachment() {
      return attachment as Attachment;
    },
  }) as NodeHubSocket;
}

class NodeHubState implements HubState {
  readonly sockets = new Set<NodeHubSocket>();
  private alarmTimer: ReturnType<typeof setTimeout> | null = null;
  onAlarm: () => Promise<void> = async () => {};

  acceptWebSocket(socket: HubSocket) {
    this.sockets.add(socket as NodeHubSocket);
  }

  getWebSockets(): HubSocket[] {
    // A socket that is closing is still in the set until its close event;
    // sending to it would only produce an error nobody is listening for.
    return [...this.sockets].filter((socket) => socket.readyState === socket.OPEN);
  }

  storage = {
    // Same semantics as the alarm it replaces: one pending alarm, and
    // setting it again moves it.
    setAlarm: async (time: number) => {
      this.clearAlarm();
      this.alarmTimer = setTimeout(() => {
        this.alarmTimer = null;
        this.onAlarm().catch((err) => console.error("[realtime] hub alarm failed:", err));
      }, Math.max(0, time - Date.now()));
      this.alarmTimer.unref();
    },
  };

  clearAlarm() {
    if (this.alarmTimer) clearTimeout(this.alarmTimer);
    this.alarmTimer = null;
  }
}

interface HubEntry {
  hub: AvailabilityHub;
  state: NodeHubState;
}

export class HubRegistry {
  private readonly hubs = new Map<string, HubEntry>();

  constructor(private readonly secret: string) {}

  /** The org's hub, created on first use. */
  get(orgId: string): AvailabilityHub {
    return this.entry(orgId).hub;
  }

  private entry(orgId: string): HubEntry {
    let entry = this.hubs.get(orgId);
    if (!entry) {
      const state = new NodeHubState();
      const hub = new AvailabilityHub(state, { REALTIME_SECRET: this.secret });
      hub.setOrgId(orgId);
      state.onAlarm = () => hub.alarm();
      entry = { hub, state };
      this.hubs.set(orgId, entry);
    }
    return entry;
  }

  /**
   * Takes a closed socket out of its hub, telling the hub first — it
   * recomputes that teacher's presence without the departing socket.
   */
  remove(orgId: string, socket: NodeHubSocket) {
    const entry = this.hubs.get(orgId);
    if (!entry || !entry.state.sockets.has(socket)) return;
    entry.hub.webSocketClose(socket);
    entry.state.sockets.delete(socket);
    this.reap(orgId);
  }

  /** Drops an org's hub once nobody is connected to it. */
  reap(orgId: string) {
    const entry = this.hubs.get(orgId);
    if (entry && entry.state.sockets.size === 0) {
      entry.state.clearAlarm();
      this.hubs.delete(orgId);
    }
  }

  stats() {
    let sockets = 0;
    for (const { state } of this.hubs.values()) sockets += state.sockets.size;
    return { hubs: this.hubs.size, sockets };
  }

  closeAll(code: number, reason: string) {
    for (const { state } of this.hubs.values()) {
      state.clearAlarm();
      for (const socket of state.sockets) socket.close(code, reason);
    }
    this.hubs.clear();
  }
}
