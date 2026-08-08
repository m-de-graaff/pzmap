# pzmap Live — Piece 2: Friends Rooms (Cloudflare Relay) Implementation Plan

> **To execute:** use the `executing-plans` skill. Steps use `- [ ]` for tracking.

**Goal:** Two or more browser tabs, each already showing its own live position (piece 1), can
join the same "room" by URL — `#room=abcd2345` — and see each other's live markers on the map.
No accounts, no persistent storage; the room exists only while someone is connected to it.

**Architecture:** A Cloudflare Worker fronts one Durable Object per room (`env.ROOMS.idFromName(code)`).
Each browser tab that's already polling its own `pzmap-live.json` (piece 1) opens a WebSocket to
its room and publishes that same `LivePayload` on every change; the Durable Object broadcasts a
full snapshot of all connected publishers to everyone in the room. A tab can also *join* a room
purely to watch — it never needs to be running the mod itself. State lives only in the Durable
Object's memory (no `ctx.storage`), so a room evaporates on its own once everyone disconnects —
there is nothing to clean up.

**Deviation from the original design sketch:** the initial brainstorm mentioned "websocket
hibernation." This plan uses a plain always-active Durable Object instead. Hibernation requires
moving publisher state out of an in-memory `Map` and into `ctx.storage` (state gets evicted from
memory when the DO hibernates), which is real added complexity and a real correctness risk this
plan can't fully load-test. At friends-group scale (a handful of rooms, a handful of members
each), the duration-billing cost hibernation avoids is negligible — likely inside Cloudflare's
free tier outright. Simple and provably correct beats cheap-at-a-scale-this-never-reaches.
Flagging this now rather than silently deviating from the earlier pitch.

**Tech stack:** Cloudflare Workers + Durable Objects, `wrangler` (already fetchable via
`npx wrangler` — confirmed v4.120.0 in this environment, so the Worker can be built and run
locally with `wrangler dev` for real verification, no Cloudflare account or deploy needed for
that). New package `relay/` (its own `package.json`, independent of the web app's). Web app side
adds `src/live/relayClient.ts` and `src/live/roomHash.ts`, both tested with `vitest` (already
set up in piece 1).

## Global Constraints

- Relay message protocol (client → server): `{ type: 'publish', payload: LivePayload }`.
- Relay message protocol (server → client), in order of when each is sent:
  - `{ type: 'welcome', connId: string }` — sent once, immediately after a successful upgrade.
  - `{ type: 'state', publishers: { connId: string; payload: LivePayload }[] }` — sent to
    everyone in the room whenever the set of publishers or any publisher's payload changes.
  - `{ type: 'error', message: string }` — sent to the one connection that caused it (rate
    limit exceeded, oversized payload, malformed payload); the connection stays open.
- Room codes: 8 characters from `abcdefghjkmnpqrstuvwxyz23456789` (32-char alphabet, excludes
  `0/o/1/l/i` for readability when shared out loud or typed). Client-generated. Server validates
  format (`^[a-z2-9]{8}$` after excluding the ambiguous letters — see Task 1 for the exact set)
  and rejects anything else with an HTTP 400 before upgrading the socket.
- Per-room cap: 12 connections. Per-connection publish rate cap: one message per 400ms (extra
  messages are dropped silently — the client will just try again on its own next tick). Payload
  size cap: 8 KB per message (larger messages get an `error` reply and are dropped).
- `relay/src/protocol.ts` duplicates the `LivePayload`/`LivePlayer` shape and `parseLivePayload`
  function from `src/live/protocol.ts` rather than sharing it through an npm workspace — the two
  are independently deployable units (a Vite app and a Cloudflare Worker) and one 30-line file
  isn't worth the workspace/tsconfig-references setup. Comment both copies to say they must be
  kept in sync, same version field (`v: 1`).
- The web app's relay URL is configured via `VITE_RELAY_URL` (mirrors the existing
  `VITE_TILE_BASE` pattern in `src/data/tilesource.ts`). When unset, room UI in the sidebar is
  hidden entirely rather than shown broken — solo sharing (piece 1) always works regardless.
- No new runtime dependency in `src/` beyond the native `WebSocket` global (available in all
  target browsers and in Node 24, which is what `vitest` runs under here).
- Continue the piece-1 pattern: push impurity (network, `window.location`, `WebSocket`) to thin
  wrapper functions; keep the decision logic in plain, dependency-injected, vitest-testable
  functions.

---

### Task 1: Relay protocol + pure room logic

**Files:**
- Create: `relay/package.json`
- Create: `relay/tsconfig.json`
- Create: `relay/src/protocol.ts`
- Create: `relay/src/roomLogic.ts`
- Create: `relay/src/roomLogic.test.ts`
- Create: `relay/vitest.config.ts`

**Interfaces:**
- Produces (from `relay/src/protocol.ts`):
  - `LIVE_PROTOCOL_VERSION`, `LivePlayer`, `LivePayload`, `parseLivePayload` — identical shape to
    `src/live/protocol.ts` (see Global Constraints).
- Produces (from `relay/src/roomLogic.ts`):
  - `export const MAX_ROOM_MEMBERS = 12`
  - `export const MAX_PAYLOAD_BYTES = 8192`
  - `export const MIN_PUBLISH_INTERVAL_MS = 400`
  - `export const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'`
  - `export function isValidRoomCode(code: string): boolean` — exactly 8 characters, every
    character in `ROOM_CODE_ALPHABET`.
  - `export interface PublisherState { connId: string; payload: LivePayload; lastPublishMs: number }`
  - `export function shouldRateLimit(state: PublisherState | undefined, nowMs: number): boolean` —
    `true` if `state` exists and `nowMs - state.lastPublishMs < MIN_PUBLISH_INTERVAL_MS`.
  - `export function buildSnapshot(publishers: Map<string, PublisherState>): { type: 'state'; publishers: { connId: string; payload: LivePayload }[] }`

- [ ] **Step 1: Package scaffold**

Create `relay/package.json`:

```json
{
  "name": "pzmap-live-relay",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260101.0",
    "typescript": "~6.0.2",
    "vitest": "^4.1.10",
    "wrangler": "^4.120.0"
  }
}
```

Create `relay/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

Create `relay/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

Run: `cd relay && npm install`
Expect: installs cleanly.

- [ ] **Step 2: Protocol mirror**

Create `relay/src/protocol.ts` — byte-for-byte the same logic as `src/live/protocol.ts` from
piece 1 (Task 1 of that plan), with a header comment:

```ts
// Mirrors src/live/protocol.ts in the pzmap web app. Kept as a separate copy
// because this Worker and the Vite app are independently deployable units —
// see docs/plans/2026-08-08-pzmap-live-2-relay.md, Global Constraints.
// Keep the `v` field and shape in sync by hand.

export const LIVE_PROTOCOL_VERSION = 1;

export interface LivePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  facing?: number;
  updatedAt: number;
}

export interface LivePayload {
  v: number;
  players: LivePlayer[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parsePlayer(raw: unknown): LivePlayer | null {
  if (!isRecord(raw)) return null;
  const { id, name, x, y, z, updatedAt, facing } = raw;
  if (typeof id !== 'string') return null;
  if (typeof name !== 'string') return null;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
  if (typeof updatedAt !== 'number') return null;
  const player: LivePlayer = { id, name, x, y, z, updatedAt };
  if (typeof facing === 'number') player.facing = facing;
  return player;
}

export function parseLivePayload(raw: unknown): LivePayload | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== LIVE_PROTOCOL_VERSION) return null;
  if (!Array.isArray(raw.players)) return null;
  const players: LivePlayer[] = [];
  for (const entry of raw.players) {
    const parsed = parsePlayer(entry);
    if (parsed) players.push(parsed);
  }
  return { v: raw.v, players };
}
```

- [ ] **Step 3: Write the failing tests for room logic**

Create `relay/src/roomLogic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isValidRoomCode,
  shouldRateLimit,
  buildSnapshot,
  MIN_PUBLISH_INTERVAL_MS,
} from './roomLogic';
import type { PublisherState } from './roomLogic';
import { LIVE_PROTOCOL_VERSION } from './protocol';

describe('isValidRoomCode', () => {
  it('accepts an 8-char code from the room alphabet', () => {
    expect(isValidRoomCode('ab234567')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidRoomCode('abc')).toBe(false);
    expect(isValidRoomCode('ab234567890')).toBe(false);
  });

  it('rejects characters outside the alphabet (ambiguous letters, uppercase, symbols)', () => {
    expect(isValidRoomCode('ab234560')).toBe(false); // '0' excluded
    expect(isValidRoomCode('AB234567')).toBe(false); // uppercase
    expect(isValidRoomCode('ab234!67')).toBe(false); // symbol
  });
});

describe('shouldRateLimit', () => {
  it('allows the first publish (no prior state)', () => {
    expect(shouldRateLimit(undefined, 1000)).toBe(false);
  });

  it('blocks a publish inside the minimum interval', () => {
    const state: PublisherState = { connId: 'a', payload: { v: 1, players: [] }, lastPublishMs: 1000 };
    expect(shouldRateLimit(state, 1000 + MIN_PUBLISH_INTERVAL_MS - 1)).toBe(true);
  });

  it('allows a publish once the interval has passed', () => {
    const state: PublisherState = { connId: 'a', payload: { v: 1, players: [] }, lastPublishMs: 1000 };
    expect(shouldRateLimit(state, 1000 + MIN_PUBLISH_INTERVAL_MS)).toBe(false);
  });
});

describe('buildSnapshot', () => {
  it('produces a state message listing every publisher by connId', () => {
    const publishers = new Map<string, PublisherState>([
      ['a', { connId: 'a', payload: { v: LIVE_PROTOCOL_VERSION, players: [] }, lastPublishMs: 0 }],
      ['b', { connId: 'b', payload: { v: LIVE_PROTOCOL_VERSION, players: [] }, lastPublishMs: 0 }],
    ]);
    expect(buildSnapshot(publishers)).toEqual({
      type: 'state',
      publishers: [
        { connId: 'a', payload: { v: LIVE_PROTOCOL_VERSION, players: [] } },
        { connId: 'b', payload: { v: LIVE_PROTOCOL_VERSION, players: [] } },
      ],
    });
  });

  it('produces an empty list for an empty room', () => {
    expect(buildSnapshot(new Map())).toEqual({ type: 'state', publishers: [] });
  });
});
```

- [ ] **Step 4: Run it, confirm it fails**

Run: `cd relay && npx vitest run src/roomLogic.test.ts`
Expect: FAIL — `Cannot find module './roomLogic'`.

- [ ] **Step 5: Implement**

Create `relay/src/roomLogic.ts`:

```ts
import type { LivePayload } from './protocol';

export const MAX_ROOM_MEMBERS = 12;
export const MAX_PAYLOAD_BYTES = 8192;
export const MIN_PUBLISH_INTERVAL_MS = 400;
export const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{8}$`);

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_RE.test(code);
}

export interface PublisherState {
  connId: string;
  payload: LivePayload;
  lastPublishMs: number;
}

export function shouldRateLimit(state: PublisherState | undefined, nowMs: number): boolean {
  if (!state) return false;
  return nowMs - state.lastPublishMs < MIN_PUBLISH_INTERVAL_MS;
}

export function buildSnapshot(publishers: Map<string, PublisherState>) {
  return {
    type: 'state' as const,
    publishers: Array.from(publishers.values()).map(({ connId, payload }) => ({ connId, payload })),
  };
}
```

- [ ] **Step 6: Run it, confirm it passes**

Run: `cd relay && npx vitest run src/roomLogic.test.ts`
Expect: PASS, 7 tests.

- [ ] **Step 7: Commit**

`git add relay/package.json relay/package-lock.json relay/tsconfig.json relay/vitest.config.ts relay/src/protocol.ts relay/src/roomLogic.ts relay/src/roomLogic.test.ts`
`git commit -m "Add relay package with room protocol and pure room logic"`

---

### Task 2: Durable Object + Worker entry point

**Files:**
- Create: `relay/src/index.ts`
- Create: `relay/wrangler.toml`
- Create: `relay/scripts/check-relay.mjs` (throwaway local integration check, not a unit test)

**Interfaces:**
- Consumes: everything from Task 1 (`relay/src/protocol.ts`, `relay/src/roomLogic.ts`).
- Produces: a deployable Worker. Route surface: `GET /room/:code` — must be a WebSocket
  upgrade request (`Upgrade: websocket` header); anything else on that path is 400. Any other
  path is 404.

No vitest coverage here — this file's only job is wiring the pure functions from Task 1 to the
`WebSocketPair`/`DurableObject` platform APIs, and that wiring can't run outside `workerd`.
Verified instead by actually running it locally with `wrangler dev` (no Cloudflare account
needed for local dev) and a small Node script that opens real WebSocket connections against it —
a stronger check than a mock would give, and one this plan can actually run.

- [ ] **Step 1: wrangler.toml**

Create `relay/wrangler.toml`:

```toml
name = "pzmap-live-relay"
main = "src/index.ts"
compatibility_date = "2026-08-01"

[[durable_objects.bindings]]
name = "ROOMS"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]
```

- [ ] **Step 2: Worker + Durable Object**

Create `relay/src/index.ts`:

```ts
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

    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(request);
  },
};
```

- [ ] **Step 3: Local integration check script**

Create `relay/scripts/check-relay.mjs`:

```js
// Throwaway local check: run `npm run dev` in relay/ in one terminal, then
// `node scripts/check-relay.mjs` in another. Opens two connections to the
// same room and confirms each sees the other's published payload. Not part
// of the automated test suite — talks to a real running wrangler dev server.

const ROOM = 'checkroom';
const URL = `ws://localhost:8787/room/${ROOM}`;

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const seen = [];
    ws.addEventListener('open', () => console.log(`[${name}] connected`));
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      console.log(`[${name}] received`, msg);
      if (msg.type === 'welcome') {
        ws.send(JSON.stringify({
          type: 'publish',
          payload: { v: 1, players: [{ id: '1', name, x: 100, y: 200, z: 0, updatedAt: Date.now() }] },
        }));
      }
      if (msg.type === 'state') seen.push(msg);
    });
    ws.addEventListener('error', reject);
    setTimeout(() => resolve({ ws, seen }), 1500);
  });
}

const [a, b] = await Promise.all([connect('alice'), connect('bob')]);

const aliceSawBob = a.seen.some((s) => s.publishers.some((p) => p.payload.players[0]?.name === 'bob'));
const bobSawAlice = b.seen.some((s) => s.publishers.some((p) => p.payload.players[0]?.name === 'alice'));

console.log('alice saw bob:', aliceSawBob);
console.log('bob saw alice:', bobSawAlice);

a.ws.close();
b.ws.close();

if (!aliceSawBob || !bobSawAlice) {
  console.error('FAIL: relay did not broadcast cross-connection state');
  process.exit(1);
}
console.log('PASS');
process.exit(0);
```

- [ ] **Step 4: Run the local integration check**

Run: `cd relay && npx wrangler dev --port 8787` (leave running in the background)
Run: `cd relay && node scripts/check-relay.mjs`
Expect: `alice saw bob: true`, `bob saw alice: true`, `PASS`.

Then stop the `wrangler dev` process.

- [ ] **Step 5: Commit**

`git add relay/src/index.ts relay/wrangler.toml relay/scripts/check-relay.mjs`
`git commit -m "Add relay Worker and Durable Object with a local integration check"`

---

### Task 3: URL hash room param (shared with MapView's existing hash)

**Files:**
- Create: `src/live/roomHash.ts`
- Create: `src/live/roomHash.test.ts`
- Modify: `src/components/MapView.tsx`

**Interfaces:**
- Produces:
  - `export function readRoomCode(hash: string): string | null` — pure; reads a `room=` param
    from a `location.hash`-shaped string (leading `#` optional).
  - `export function writeRoomCode(hash: string, code: string | null): string` — pure; returns
    a new hash string (no leading `#`) with `room=` set to `code`, or removed if `code` is
    `null`, preserving every other param untouched.
  - `export function getRoomCodeFromHash(): string | null` — thin wrapper: `readRoomCode(window.location.hash)`.
  - `export function setRoomCodeInHash(code: string | null): void` — thin wrapper: computes the
    next hash with `writeRoomCode` and calls `history.replaceState`.
- Consumes (in `MapView.tsx`): `getRoomCodeFromHash` — used in the existing `moveend` handler so
  panning the map doesn't erase an active room code from the URL. This is the bug this task
  exists to prevent: `MapView.tsx:188-195` currently does
  `history.replaceState(null, '', `#x=${x}&y=${y}&z=${map.getZoom()}`)`, which would silently
  wipe out `&room=...` the moment the user pans, breaking every shared room link.

- [ ] **Step 1: Write the failing tests**

Create `src/live/roomHash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readRoomCode, writeRoomCode } from './roomHash';

describe('readRoomCode', () => {
  it('reads a room param alongside others', () => {
    expect(readRoomCode('#x=100&y=200&z=-3&room=ab234567')).toBe('ab234567');
  });

  it('reads a room param on its own', () => {
    expect(readRoomCode('#room=ab234567')).toBe('ab234567');
  });

  it('returns null when there is no room param', () => {
    expect(readRoomCode('#x=100&y=200&z=-3')).toBeNull();
    expect(readRoomCode('')).toBeNull();
  });
});

describe('writeRoomCode', () => {
  it('adds a room param to an existing hash without disturbing other params', () => {
    expect(writeRoomCode('#x=100&y=200&z=-3', 'ab234567')).toBe('x=100&y=200&z=-3&room=ab234567');
  });

  it('replaces an existing room param in place', () => {
    expect(writeRoomCode('#x=100&room=oldcode1&y=200', 'newcode1')).toBe('x=100&room=newcode1&y=200');
  });

  it('removes the room param when code is null', () => {
    expect(writeRoomCode('#x=100&room=ab234567&y=200', null)).toBe('x=100&y=200');
  });

  it('produces just the room param when the hash was empty', () => {
    expect(writeRoomCode('', 'ab234567')).toBe('room=ab234567');
    expect(writeRoomCode('#', 'ab234567')).toBe('room=ab234567');
  });

  it('produces an empty string when removing the only param', () => {
    expect(writeRoomCode('#room=ab234567', null)).toBe('');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/live/roomHash.test.ts`
Expect: FAIL — `Cannot find module './roomHash'`.

- [ ] **Step 3: Implement**

Create `src/live/roomHash.ts`:

```ts
const ROOM_PARAM_RE = /(?:^|&)room=([^&]*)/;

export function readRoomCode(hash: string): string | null {
  const m = hash.match(ROOM_PARAM_RE);
  return m ? m[1] : null;
}

export function writeRoomCode(hash: string, code: string | null): string {
  const stripped = hash.replace(/^#/, '').replace(ROOM_PARAM_RE, '').replace(/^&/, '');
  if (!code) return stripped;
  return stripped ? `${stripped}&room=${code}` : `room=${code}`;
}

export function getRoomCodeFromHash(): string | null {
  return readRoomCode(window.location.hash);
}

export function setRoomCodeInHash(code: string | null): void {
  const next = writeRoomCode(window.location.hash, code);
  history.replaceState(null, '', next ? `#${next}` : window.location.pathname + window.location.search);
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run src/live/roomHash.test.ts`
Expect: PASS, 8 tests.

- [ ] **Step 5: Fix MapView's hash write to preserve the room param**

In `src/components/MapView.tsx`, add the import:

```ts
import { getRoomCodeFromHash } from '../live/roomHash';
```

Change the `moveend` handler (currently around line 188-195):

```ts
map.on('moveend', () => {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    if (!map || !projRef.current) return;
    const { x, y } = projRef.current.unproject(map.getCenter());
    const room = getRoomCodeFromHash();
    history.replaceState(null, '', `#x=${x}&y=${y}&z=${map.getZoom()}${room ? `&room=${room}` : ''}`);
  }, 150);
});
```

- [ ] **Step 6: Build check**

Run: `npm run build`
Expect: succeeds.

- [ ] **Step 7: Commit**

`git add src/live/roomHash.ts src/live/roomHash.test.ts src/components/MapView.tsx`
`git commit -m "Add room-aware URL hash handling; stop MapView from erasing it on pan"`

---

### Task 4: Browser relay client

**Files:**
- Create: `src/live/relayClient.ts`
- Create: `src/live/relayClient.test.ts`

**Interfaces:**
- Consumes: `LivePayload` from `src/live/protocol.ts`.
- Produces:
  - `export type RoomStatus = 'connecting' | 'connected' | 'disconnected' | 'error'`
  - `export interface RoomPublisher { connId: string; payload: LivePayload }`
  - `export interface RoomClientHandlers { onStatus: (status: RoomStatus, message?: string) => void; onState: (publishers: RoomPublisher[]) => void }`
  - `export function generateRoomCode(): string` — 8 random characters from the same alphabet as
    `relay/src/roomLogic.ts` (`ROOM_CODE_ALPHABET`, duplicated as a local constant here for the
    same reason as the protocol mirror in Task 1 — see Global Constraints).
  - `export function connectToRoom(relayUrl: string, roomCode: string, handlers: RoomClientHandlers, WebSocketImpl?: typeof WebSocket): { publish: (payload: LivePayload) => void; close: () => void }` —
    opens a WebSocket to `${relayUrl}/room/${roomCode}`; on unexpected close (not from calling
    the returned `close()`), reconnects with backoff starting at 1000ms, doubling, capped at
    10000ms; `publish` sends `{ type: 'publish', payload }` if the socket is open, no-ops
    otherwise (the caller doesn't need to track connection state itself).

- [ ] **Step 1: Write the failing tests**

Create `src/live/relayClient.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectToRoom, generateRoomCode } from './relayClient';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(public url: string) {
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
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/live/relayClient.test.ts`
Expect: FAIL — `Cannot find module './relayClient'`.

- [ ] **Step 3: Implement**

Create `src/live/relayClient.ts`:

```ts
import type { LivePayload } from './protocol';

export type RoomStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RoomPublisher {
  connId: string;
  payload: LivePayload;
}

export interface RoomClientHandlers {
  onStatus: (status: RoomStatus, message?: string) => void;
  onState: (publishers: RoomPublisher[]) => void;
}

const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateRoomCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
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
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run src/live/relayClient.test.ts`
Expect: PASS, 7 tests.

- [ ] **Step 5: Commit**

`git add src/live/relayClient.ts src/live/relayClient.test.ts`
`git commit -m "Add browser relay client with reconnect backoff"`

---

### Task 5: Room UI in Sidebar + App wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.css`
- Create: `.env.example` entry (see Step 5)

**Interfaces:**
- Consumes: `connectToRoom`, `generateRoomCode`, `RoomStatus`, `RoomPublisher` from
  `src/live/relayClient.ts`; `getRoomCodeFromHash`, `setRoomCodeInHash` from `src/live/roomHash.ts`.
- Produces: new `SidebarProps` fields — `relayEnabled: boolean`, `roomCode: string | null`,
  `roomStatus: RoomStatus | null`, `roomMembers: RoomPublisher[]`, `onStartRoom: () => void`,
  `onLeaveRoom: () => void`. `MapView`'s `livePlayers` prop (from piece 1) now receives the
  merged self + room member list from `App.tsx` — `MapView.tsx` itself is unchanged, since it
  already just renders whatever's in that array.

No automated test (App-level composition wiring plus DOM rendering — same rationale as piece
1's Task 6). Verified manually together with the relay's local integration check from Task 2:
run `wrangler dev` in `relay/`, run `npm run dev` in the web app with `VITE_RELAY_URL=ws://localhost:8787`,
open two browser profiles/tabs, start a room in one, copy the link, open it in the other,
confirm each shows the other's marker.

- [ ] **Step 1: Add room state to App**

In `src/App.tsx`, add imports:

```ts
import { connectToRoom, generateRoomCode } from './live/relayClient';
import type { RoomStatus, RoomPublisher } from './live/relayClient';
import { getRoomCodeFromHash, setRoomCodeInHash } from './live/roomHash';
```

Add state after the existing live-related `useState` calls:

```ts
const relayUrl = import.meta.env.VITE_RELAY_URL as string | undefined;
const [roomCode, setRoomCode] = useState<string | null>(null);
const [roomStatus, setRoomStatus] = useState<RoomStatus | null>(null);
const [roomPublishers, setRoomPublishers] = useState<RoomPublisher[]>([]);
const roomConnRef = useRef<{ publish: (p: LivePayload) => void; close: () => void } | null>(null);
```

Add the import `import type { LivePayload } from './live/protocol';` alongside the existing
`LivePlayer` type import (extend the existing `import type { LivePlayer } from './live/protocol';`
line to `import type { LivePlayer, LivePayload } from './live/protocol';`).

- [ ] **Step 2: Join/leave room logic**

Add after `handlePickLiveFile`:

```ts
const joinRoom = (code: string) => {
  if (!relayUrl) return;
  roomConnRef.current?.close();
  setRoomCode(code);
  setRoomCodeInHash(code);
  roomConnRef.current = connectToRoom(relayUrl, code, {
    onStatus: setRoomStatus,
    onState: setRoomPublishers,
  });
};

const handleStartRoom = () => joinRoom(generateRoomCode());

const handleLeaveRoom = () => {
  roomConnRef.current?.close();
  roomConnRef.current = null;
  setRoomCode(null);
  setRoomStatus(null);
  setRoomPublishers([]);
  setRoomCodeInHash(null);
};
```

Add auto-join on load, alongside the existing mount effects:

```ts
useEffect(() => {
  const code = getRoomCodeFromHash();
  if (code) joinRoom(code);
  return () => roomConnRef.current?.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

(This mirrors the existing `streetLocs` mount effect's pattern of a one-time effect with an
intentionally-empty dependency array — `joinRoom` is stable enough for a mount-only call and the
codebase doesn't run `eslint`, only `oxlint`, so check `npm run lint` stays clean after this;
if `oxlint` flags the missing dependency, wrap `joinRoom` in `useCallback` instead of suppressing.)

- [ ] **Step 3: Publish local position into the room**

Extend `handlePickLiveFile`'s `onPayload` so a locally-shared position also gets published to
an active room:

```ts
onPayload: (payload) => {
  setLivePlayers(payload.players);
  roomConnRef.current?.publish(payload);
},
```

- [ ] **Step 4: Merge room members into the map's live layer**

Replace the `livePlayers` passed to `MapView` with a merged list. Add above the `return`:

```ts
const mergedLivePlayers: LivePlayer[] = [
  ...livePlayers,
  ...roomPublishers.flatMap(({ connId, payload }) =>
    payload.players.map((p) => ({ ...p, id: `${connId}:${p.id}` })),
  ),
];
```

(The `connId:` prefix keeps room members' IDs from colliding with each other or with the local
player — see the plan's design note on why the mod's own `id` field isn't safely unique across
different players' singleplayer games.)

Update the `<MapView>` element's `livePlayers` prop to `mergedLivePlayers` and `followLiveId` to
`followEnabled ? (mergedLivePlayers[0]?.id ?? null) : null`.

- [ ] **Step 5: Pass room props to Sidebar; env example**

Add to the `<Sidebar>` element:

```tsx
relayEnabled={Boolean(relayUrl)}
roomCode={roomCode}
roomStatus={roomStatus}
roomMembers={roomPublishers}
onStartRoom={handleStartRoom}
onLeaveRoom={handleLeaveRoom}
```

Create `.env.example` at the repo root (if it doesn't exist) or append to it:

```
# ws:// for local `wrangler dev`, wss:// for a deployed relay. Unset disables the friends-room UI.
VITE_RELAY_URL=ws://localhost:8787
```

- [ ] **Step 6: Sidebar room UI**

In `src/components/Sidebar.tsx`, add imports:

```ts
import type { RoomStatus, RoomPublisher } from '../live/relayClient';
```

Extend `SidebarProps`:

```ts
interface SidebarProps {
  // ...existing fields...
  relayEnabled: boolean;
  roomCode: string | null;
  roomStatus: RoomStatus | null;
  roomMembers: RoomPublisher[];
  onStartRoom: () => void;
  onLeaveRoom: () => void;
}
```

Destructure the new props, then extend the live panel (inside the existing `<div className="live-panel">`
from piece 1, after the `follow me` / `share my location` button block, before the closing
`</div>`):

```tsx
{relayEnabled && (
  <div className="room-row">
    {roomCode ? (
      <>
        <span className="room-status">
          {roomStatus === 'connected' ? `Room ${roomCode} · ${roomMembers.length} here` : 'Connecting…'}
        </span>
        <button type="button" className="btn" onClick={onLeaveRoom}>Leave room</button>
      </>
    ) : (
      <button type="button" className="btn" onClick={onStartRoom}>Start a room</button>
    )}
  </div>
)}
```

- [ ] **Step 7: Style**

In `src/App.css`, after the `.live-hint` rules added in piece 1, add:

```css
.room-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.room-status {
  font-size: 12px;
  color: var(--text-dim);
}
```

- [ ] **Step 8: Build, lint, test**

Run: `npm run build`
Expect: succeeds.

Run: `npm run lint`
Expect: no new warnings.

Run: `npx vitest run`
Expect: all tests from pieces 1 and 2 pass (12 + 7 + 8 + 7 = 34 in the web app; separately,
`cd relay && npx vitest run` passes its own 7).

- [ ] **Step 9: Manual two-tab verification**

Start the relay locally: `cd relay && npx wrangler dev --port 8787`.
Start the web app: `VITE_RELAY_URL=ws://localhost:8787 npm run dev` (or set it in `.env.local`).
Open the app in two separate browser tabs (or profiles, so they don't share the same
File-System-Access-picked file). In tab A, use the manual test-file substitution from piece 1's
Task 6 step 4 to get a live marker showing, then click "Start a room" — a `room=` code appears
in the URL. Copy that URL into tab B and load it — tab B should show tab A's marker without tab B
needing its own live file at all. Confirm panning the map in either tab keeps `room=` in the URL
(the bug Task 3 exists to prevent).

- [ ] **Step 10: Commit**

`git add src/App.tsx src/components/Sidebar.tsx src/App.css .env.example`
`git commit -m "Add friends-room UI: start/join/leave, member list, live URL sharing"`

---

## Self-review notes

- Spec coverage: room creation/join/leave (Task 5), live URL sharing via `room=` hash param
  (Task 3, Task 5), cross-connection identity collision avoidance (Task 5 step 4's `connId:`
  prefix), rate limiting and payload/room-size caps (Task 1, wired in Task 2), "rooms evaporate
  when empty" (achieved structurally — no `ctx.storage` used anywhere, see Global Constraints
  deviation note) — all present. Server-wide/whole-server view is explicitly piece 3, not here.
- No placeholders: every snippet is complete, runnable code.
- Name consistency checked: `LivePayload`/`parseLivePayload` (Task 1's relay mirror) match
  Task 2's imports. `RoomStatus`/`RoomPublisher`/`connectToRoom`/`generateRoomCode` (Task 4)
  match Task 5's imports. `getRoomCodeFromHash`/`setRoomCodeInHash` (Task 3) match Task 5's
  imports and Task 3's own `MapView.tsx` edit.
