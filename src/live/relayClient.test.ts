import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectToRoom, generateRoomCode } from './relayClient';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  // test helper, not part of the real WebSocket interface
  serverMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  serverOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('generateRoomCode', () => {
  it('produces an 8-character code from the room alphabet', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  });

  it('is not the same on every call', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('connectToRoom', () => {
  it('connects to the room URL and reports status transitions', () => {
    const onStatus = vi.fn();
    const onState = vi.fn();
    connectToRoom('ws://relay.example', 'ab234567', { onStatus, onState }, FakeWebSocket as never);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe('ws://relay.example/room/ab234567');
    expect(onStatus).toHaveBeenCalledWith('connecting');

    FakeWebSocket.instances[0].serverOpen();
    expect(onStatus).toHaveBeenCalledWith('connected');
  });

  it('forwards state messages to onState', () => {
    const onState = vi.fn();
    connectToRoom('ws://relay.example', 'ab234567', { onStatus: vi.fn(), onState }, FakeWebSocket as never);
    const ws = FakeWebSocket.instances[0];
    ws.serverOpen();
    ws.serverMessage({ type: 'state', publishers: [{ connId: 'x', payload: { v: 1, players: [] } }] });

    expect(onState).toHaveBeenCalledWith([{ connId: 'x', payload: { v: 1, players: [] } }]);
  });

  it('reports this connection\'s own connId from the welcome message', () => {
    const onWelcome = vi.fn();
    connectToRoom('ws://relay.example', 'ab234567', { onStatus: vi.fn(), onState: vi.fn(), onWelcome }, FakeWebSocket as never);
    FakeWebSocket.instances[0].serverMessage({ type: 'welcome', connId: 'me-1' });

    expect(onWelcome).toHaveBeenCalledWith('me-1');
  });

  it('publish sends a publish message once open, and does nothing before that', () => {
    const conn = connectToRoom('ws://relay.example', 'ab234567', { onStatus: vi.fn(), onState: vi.fn() }, FakeWebSocket as never);
    const ws = FakeWebSocket.instances[0];
    const payload = { v: 1, players: [] };

    conn.publish(payload);
    expect(ws.sent).toHaveLength(0);

    ws.serverOpen();
    conn.publish(payload);
    expect(ws.sent).toEqual([JSON.stringify({ type: 'publish', payload })]);
  });

  it('reconnects with backoff after an unexpected close', () => {
    const onStatus = vi.fn();
    connectToRoom('ws://relay.example', 'ab234567', { onStatus, onState: vi.fn() }, FakeWebSocket as never);
    FakeWebSocket.instances[0].serverOpen();
    FakeWebSocket.instances[0].onclose?.();

    expect(onStatus).toHaveBeenCalledWith('disconnected');
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('does not reconnect after close() is called explicitly', () => {
    const conn = connectToRoom('ws://relay.example', 'ab234567', { onStatus: vi.fn(), onState: vi.fn() }, FakeWebSocket as never);
    FakeWebSocket.instances[0].serverOpen();
    conn.close();

    vi.advanceTimersByTime(15000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
