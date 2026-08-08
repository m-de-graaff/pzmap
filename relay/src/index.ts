import { DurableObject } from 'cloudflare:workers';
import { parseLivePayload } from './protocol';
import {
  isValidRoomCode,
  shouldRateLimit,
  buildSnapshot,
  MAX_ROOM_MEMBERS,
  MAX_PAYLOAD_BYTES,
} from './roomLogic';
import type { PublisherState } from './roomLogic';

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ROOM_JOIN_LIMITER: RateLimit;
}

export class Room extends DurableObject<Env> {
  private publishers = new Map<string, PublisherState>();
  private sockets = new Map<string, WebSocket>();

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a WebSocket upgrade', { status: 400 });
    }
    if (this.sockets.size >= MAX_ROOM_MEMBERS) {
      return new Response('room is full', { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connId = crypto.randomUUID();

    server.accept();
    this.sockets.set(connId, server);
    server.send(JSON.stringify({ type: 'welcome', connId }));

    server.addEventListener('message', (event) => {
      this.handleMessage(connId, event.data);
    });
    server.addEventListener('close', () => {
      this.sockets.delete(connId);
      this.publishers.delete(connId);
      this.broadcast();
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(connId: string, data: string | ArrayBuffer) {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    if (new TextEncoder().encode(text).length > MAX_PAYLOAD_BYTES) {
      this.sendError(connId, 'Payload too large.');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.sendError(connId, 'Invalid JSON.');
      return;
    }

    if (!isRecord(parsed) || parsed.type !== 'publish') {
      this.sendError(connId, 'Expected a publish message.');
      return;
    }

    const payload = parseLivePayload(parsed.payload);
    if (!payload) {
      this.sendError(connId, 'Payload does not match the live protocol.');
      return;
    }

    const now = Date.now();
    if (shouldRateLimit(this.publishers.get(connId), now)) return;

    this.publishers.set(connId, { connId, payload, lastPublishMs: now });
    this.broadcast();
  }

  private sendError(connId: string, message: string) {
    this.sockets.get(connId)?.send(JSON.stringify({ type: 'error', message }));
  }

  private broadcast() {
    const message = JSON.stringify(buildSnapshot(this.publishers));
    for (const socket of this.sockets.values()) socket.send(message);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!match) return new Response('not found', { status: 404 });

    const code = match[1];
    if (!isValidRoomCode(code)) return new Response('invalid room code', { status: 400 });

    // Keyed on IP, not room code, so guessing many different codes from one
    // source doesn't dodge the limit by spreading attempts across rooms.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.ROOM_JOIN_LIMITER.limit({ key: ip });
    if (!success) return new Response('too many room-join attempts, slow down', { status: 429 });

    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(request);
  },
};
