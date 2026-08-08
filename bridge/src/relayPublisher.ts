// Mirrors src/live/relayClient.ts's connectToRoom in the pzmap web app —
// reused unchanged; Node's built-in WebSocket satisfies the same interface.
// generateRoomCode is omitted: the bridge always joins a room an admin
// already started from the browser, it never creates one.

import type { LivePayload } from './protocol.js';

export type RoomStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RoomPublisher {
  connId: string;
  payload: LivePayload;
}

export interface RoomClientHandlers {
  onStatus: (status: RoomStatus, message?: string) => void;
  onState: (publishers: RoomPublisher[]) => void;
  onWelcome?: (connId: string) => void;
}

export function connectToRoom(
  relayUrl: string,
  roomCode: string,
  handlers: RoomClientHandlers,
  WebSocketImpl: typeof WebSocket = WebSocket,
): { publish: (payload: LivePayload) => void; close: () => void } {
  let closedByCaller = false;
  let backoffMs = 1000;
  let socket: InstanceType<typeof WebSocketImpl> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    handlers.onStatus('connecting');
    const ws = new WebSocketImpl(`${relayUrl}/room/${roomCode}`);
    socket = ws;

    ws.onopen = () => {
      backoffMs = 1000;
      handlers.onStatus('connected');
    };

    ws.onmessage = (event: { data: string }) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'welcome') handlers.onWelcome?.(msg.connId);
      if (msg.type === 'state') handlers.onState(msg.publishers);
      if (msg.type === 'error') handlers.onStatus('error', msg.message);
    };

    ws.onclose = () => {
      if (closedByCaller) return;
      handlers.onStatus('disconnected');
      reconnectTimer = setTimeout(open, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 10000);
    };

    ws.onerror = () => handlers.onStatus('error', 'Connection error.');
  };

  open();

  return {
    publish: (payload) => {
      if (socket && socket.readyState === WebSocketImpl.OPEN) {
        socket.send(JSON.stringify({ type: 'publish', payload }));
      }
    },
    close: () => {
      closedByCaller = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
