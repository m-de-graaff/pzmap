# pzmap Live — Piece 3: Server Bridge + Workshop Packaging Implementation Plan

> **To execute:** use the `executing-plans` skill. Steps use `- [ ]` for tracking.

**Goal:** A dedicated/hosted PZ server admin enables the mod's server half, which writes every
online player's position to a file on the server host. The admin runs a small standalone script
(`pzmap-bridge`) that tails that file and publishes the full player list into a relay room
(piece 2), so anyone with the room link sees the whole server live — no client-side mod install
needed for spectators. The pzmap Live mod is packaged as a single Workshop item combining all
three pieces' Lua (client half from piece 1, server half from this piece).

**Architecture:** The server-side Lua mirrors piece 1's client mod almost exactly — same
throttled-tick-and-write pattern, same JSON shape — but iterates `getOnlinePlayers()` instead of
`getPlayer()`, so one file (`pzmap-live-server.json`) carries every connected player instead of
just one. Nothing in the browser or relay needs to change to support this: `LivePayload.players`
was always an array, and piece 1's file source and piece 2's relay client already render however
many players a payload contains. The only new component is `bridge/`, a small standalone Node
CLI that plays the same role server-side that a browser tab plays for a solo/friends setup: read
the file, publish it to a relay room. It reuses piece 2's `relayClient.ts` connection logic
essentially unchanged (Node 24's built-in `WebSocket` satisfies the same interface the browser
does), and piece 1's polling pattern adapted from `FileSystemFileHandle` to plain `fs.readFile`.

**What this plan does NOT do:** publish `pzmap-bridge` to npm, deploy anything to Cloudflare, or
upload the mod to the Steam Workshop. Those are account-bound, externally-visible publishing
actions — they need Mark's own npm account, Cloudflare account, and Steam session respectively,
and publishing without being asked is out of scope regardless. This plan produces everything
those steps would consume (a working, tested bridge; complete mod.info and Workshop description
text) and documents the manual step precisely, the same way piece 1 documented the in-game mod
verification it couldn't perform itself.

**Tech stack:** Lua (server-side, PZ B42 Kahlua — `getOnlinePlayers()` confirmed against PZwiki
LuaDocs before writing this plan, same rigor as piece 1's client-side API calls). Node 24 +
TypeScript + `vitest` for the bridge, following the same pure-logic-tested /
thin-platform-wrapper-reviewed-by-hand split used throughout pieces 1 and 2.

## Global Constraints

- The server-side file is named `pzmap-live-server.json` (distinct from the client's
  `pzmap-live.json`) — written to the *server process's* `Zomboid/Lua/` folder, which on a
  dedicated server is the service account's folder, not any player's own machine. Same
  `getFileWriter(filename, true, false)` call as piece 1.
- Reuses `LIVE_PROTOCOL_VERSION = 1` and the exact `LivePayload`/`LivePlayer` shape — no protocol
  changes. `bridge/src/protocol.ts` is a third mirror of `src/live/protocol.ts`, for the same
  reason `relay/src/protocol.ts` is a second one (see piece 2's Global Constraints): three
  independently deployable units (web app, relay, bridge), one small file, not worth a workspace.
- `bridge/src/relayPublisher.ts` is piece 2's `src/live/relayClient.ts` unchanged, copied rather
  than imported across the package boundary — same rationale, and it already takes an injectable
  `WebSocketImpl`, which Node's built-in global `WebSocket` satisfies without modification.
- The bridge is not published to npm in this plan. It's runnable locally
  (`node bin/pzmap-bridge.mjs ...` after `npm run build`) and documented that way. `npm publish`
  under the name `pzmap-bridge` is a separate, explicit step for Mark to take later if he wants
  the `npx pzmap-bridge` form from the original pitch — flagged here, not silently dropped.
- Mod Workshop upload (Steam Workshop uploader in-game) is likewise not performed here — this
  plan produces the complete mod (client + server Lua, `mod.info`) and a ready-to-paste Workshop
  description, and documents the upload steps for Mark to run himself.
- Continue the established pattern: pure logic gets vitest coverage; platform code (Lua, the
  CLI's argv/IO glue) is reviewed by hand and verified with the strongest *real* check available
  without a live game server — for the bridge, that's a real `wrangler dev` relay plus a
  hand-written stand-in JSON file, the same technique piece 2's Task 2 used.

---

### Task 1: Server-half Lua mod

**Files:**
- Create: `mod/pzmapLive/42/media/lua/server/PzmapLiveServer.lua`

**Interfaces:**
- Produces: the file `pzmap-live-server.json` in the server process's `Zomboid/Lua/` folder,
  written every `WRITE_INTERVAL_MS` while the dedicated server is running, containing one entry
  per currently-online player.

No automated test — same reasoning as piece 1's Task 2 (this only runs inside a running PZ
server, which this environment can't launch). Verified by hand against `getOnlinePlayers()`
(confirmed via PZwiki LuaDocs before writing this plan: returns an ArrayList of `IsoPlayer`,
iterated with `:size()`/`:get(i)`) plus the same `getFileWriter`/`getTimestampMs`/`Events.OnTick`
calls already verified for piece 1's client half.

- [ ] **Step 1: Server Lua**

Create `mod/pzmapLive/42/media/lua/server/PzmapLiveServer.lua`:

```lua
-- Server-side counterpart to PzmapLiveClient.lua: writes every online
-- player's position to Zomboid/Lua/pzmap-live-server.json on a throttled
-- tick, in the same protocol (src/live/protocol.ts in the pzmap web repo).
-- Runs only on a dedicated/hosted server, not in singleplayer.

local FILE_NAME = "pzmap-live-server.json"
local WRITE_INTERVAL_MS = 1000
local PROTOCOL_VERSION = 1

local lastWriteMs = 0

local JSON_ESCAPES = { ['\\'] = '\\\\', ['"'] = '\\"', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

local function escapeJSON(str)
    return (str:gsub('[%c\\"]', function(c)
        return JSON_ESCAPES[c] or string.format('\\u%04x', c:byte())
    end))
end

local function playerJSON(player)
    local id = tostring(player:getOnlineID())
    local name = escapeJSON(player:getUsername() or "Survivor")
    local x = math.floor(player:getX())
    local y = math.floor(player:getY())
    local z = math.floor(player:getZ())
    local facing = player:getDirectionAngle() or 0
    local updatedAt = math.floor(os.time() * 1000)

    return string.format(
        '{"id":"%s","name":"%s","x":%d,"y":%d,"z":%d,"facing":%.1f,"updatedAt":%d}',
        id, name, x, y, z, facing, updatedAt
    )
end

local function writePayload()
    local writer = getFileWriter(FILE_NAME, true, false)
    if not writer then return end

    local players = getOnlinePlayers()
    local parts = {}
    for i = 0, players:size() - 1 do
        parts[#parts + 1] = playerJSON(players:get(i))
    end

    writer:write('{"v":' .. PROTOCOL_VERSION .. ',"players":[' .. table.concat(parts, ',') .. ']}')
    writer:close()
end

local function onTick()
    local now = getTimestampMs()
    if now - lastWriteMs < WRITE_INTERVAL_MS then return end
    lastWriteMs = now

    writePayload()
end

Events.OnTick.Add(onTick)
```

- [ ] **Step 2: Manual review pass**

Re-read the file: `playerJSON` matches the same field order/format as piece 1's client mod so
the two payloads are visually consistent; `parts` is joined with `,` and wrapped once, avoiding
a trailing-comma bug for the 0-player and N-player cases alike; `escapeJSON` is the corrected
version from piece 1's review fixes (all JSON control characters, not just `\`/`"`/`\n`) —
copied here rather than shared, since Lua has no module system in play across these two files
without additional `require` plumbing this plan doesn't need.

- [ ] **Step 3: Commit**

`git add mod/pzmapLive/42/media/lua/server/PzmapLiveServer.lua`
`git commit -m "$(cat <<'EOF'
Add pzmap Live mod server half (writes all online players)

Not yet verified on a running dedicated server — no PZ server
available in this environment. Verify manually: enable the mod on a
dedicated server, confirm Zomboid/Lua/pzmap-live-server.json appears
and lists every connected player, updating as they move.
EOF
)"`

---

### Task 2: Bridge protocol + relay publisher (reused from piece 2) + file watcher

**Files:**
- Create: `bridge/package.json`
- Create: `bridge/tsconfig.json`
- Create: `bridge/vitest.config.ts`
- Create: `bridge/src/protocol.ts`
- Create: `bridge/src/relayPublisher.ts`
- Create: `bridge/src/fileWatcher.ts`
- Create: `bridge/src/fileWatcher.test.ts`

**Interfaces:**
- Produces (`bridge/src/protocol.ts`): identical to `relay/src/protocol.ts` from piece 2.
- Produces (`bridge/src/relayPublisher.ts`): identical to `src/live/relayClient.ts` from piece 2
  (`RoomStatus`, `RoomPublisher`, `RoomClientHandlers`, `connectToRoom`) — `generateRoomCode` is
  omitted here since the bridge always joins a room an admin already started from the browser,
  never creates one.
- Produces (`bridge/src/fileWatcher.ts`):
  - `export interface FileWatcherHandlers { onPayload: (payload: LivePayload) => void; onStatus: (status: 'reading' | 'error', message?: string) => void }`
  - `export function startFileWatching(readFile: () => Promise<string>, intervalMs: number, handlers: FileWatcherHandlers): () => void` —
    same contract as piece 1's `startPolling`, but takes a generic async read function instead
    of a `FileSystemFileHandle`, so it has no browser dependency and is directly testable with a
    plain fake function (no fake-handle object needed, unlike piece 1's fileSource tests).

- [ ] **Step 1: Package scaffold**

Create `bridge/package.json`:

```json
{
  "name": "pzmap-bridge",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "pzmap-bridge": "./bin/pzmap-bridge.mjs"
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.10"
  }
}
```

Create `bridge/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "declaration": false
  },
  "include": ["src"]
}
```

Create `bridge/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

Run: `cd bridge && npm install`
Expect: installs cleanly.

- [ ] **Step 2: Protocol and relay publisher mirrors**

Create `bridge/src/protocol.ts` with the identical content as `relay/src/protocol.ts` from
piece 2 (same header comment, updated to say "Mirrors src/live/protocol.ts" and note this is
the third copy — see this plan's Global Constraints).

Create `bridge/src/relayPublisher.ts` with the identical content as `src/live/relayClient.ts`
from piece 2, minus the `generateRoomCode` export (not needed — see Interfaces above), with a
header comment: `// Mirrors src/live/relayClient.ts's connectToRoom in the pzmap web app —`
`// reused unchanged; Node 24's built-in WebSocket satisfies the same interface.`

- [ ] **Step 3: Write the failing tests for the file watcher**

Create `bridge/src/fileWatcher.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFileWatching } from './fileWatcher';
import { LIVE_PROTOCOL_VERSION } from './protocol';

describe('startFileWatching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads on an interval and reports valid payloads', async () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [] };
    const readFile = vi.fn().mockResolvedValue(JSON.stringify(payload));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    const stop = startFileWatching(readFile, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledWith(payload);
    expect(onStatus).toHaveBeenCalledWith('reading');

    await vi.advanceTimersByTimeAsync(1000);
    expect(readFile).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('reports an error and skips onPayload on invalid JSON', async () => {
    const readFile = vi.fn().mockResolvedValue('{not json');
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startFileWatching(readFile, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onPayload).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('reports an error when the file read itself rejects (e.g. ENOENT)', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('ENOENT: no such file'));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startFileWatching(readFile, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onPayload).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error', 'ENOENT: no such file');
  });

  it('keeps watching after a transient error clears', async () => {
    const good = { v: LIVE_PROTOCOL_VERSION, players: [] };
    const readFile = vi.fn()
      .mockResolvedValueOnce('{bad')
      .mockResolvedValue(JSON.stringify(good));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startFileWatching(readFile, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledWith(good);
  });
});
```

- [ ] **Step 4: Run it, confirm it fails**

Run: `cd bridge && npx vitest run src/fileWatcher.test.ts`
Expect: FAIL — `Cannot find module './fileWatcher'`.

- [ ] **Step 5: Implement**

Create `bridge/src/fileWatcher.ts`:

```ts
import { parseLivePayload } from './protocol';
import type { LivePayload } from './protocol';

export interface FileWatcherHandlers {
  onPayload: (payload: LivePayload) => void;
  onStatus: (status: 'reading' | 'error', message?: string) => void;
}

export function startFileWatching(
  readFile: () => Promise<string>,
  intervalMs: number,
  { onPayload, onStatus }: FileWatcherHandlers,
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const text = await readFile();
      const payload = parseLivePayload(JSON.parse(text));
      if (!payload) {
        onStatus('error', 'File does not match the pzmap Live format.');
        return;
      }
      onStatus('reading');
      onPayload(payload);
    } catch (err) {
      onStatus('error', err instanceof Error ? err.message : 'Failed to read live file.');
    }
  };

  const id = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}
```

- [ ] **Step 6: Run it, confirm it passes**

Run: `cd bridge && npx vitest run src/fileWatcher.test.ts`
Expect: PASS, 4 tests.

- [ ] **Step 7: Typecheck**

Run: `cd bridge && npx tsc -b`
Expect: succeeds with no errors (this compiles `dist/`, needed by the CLI in Task 3).

- [ ] **Step 8: Commit**

`git add bridge/package.json bridge/package-lock.json bridge/tsconfig.json bridge/vitest.config.ts bridge/src/protocol.ts bridge/src/relayPublisher.ts bridge/src/fileWatcher.ts bridge/src/fileWatcher.test.ts`
`git commit -m "Add pzmap-bridge package: protocol, relay publisher, file watcher"`

---

### Task 3: Bridge CLI + local integration check

**Files:**
- Create: `bridge/src/cli.ts`
- Create: `bridge/bin/pzmap-bridge.mjs`
- Create: `bridge/scripts/check-bridge.mjs`

**Interfaces:**
- Consumes: `startFileWatching` (Task 2), `connectToRoom` from `relayPublisher.ts` (Task 2).
- Produces: an executable CLI, `bin/pzmap-bridge.mjs --file <path> --relay <ws-url> --room <code> [--interval-ms 1000]`.

No vitest coverage for the CLI itself (argv parsing and process wiring, same rationale as
piece 2's `relay/src/index.ts`). Verified the same way piece 2's Task 2 verified the relay: a
real `wrangler dev` relay, a hand-written stand-in for the server mod's output file (since no
PZ server is available here), and a script that confirms a third WebSocket client watching the
room actually receives what the bridge published.

- [ ] **Step 1: CLI**

Create `bridge/src/cli.ts`:

```ts
import { readFile as fsReadFile } from 'node:fs/promises';
import { startFileWatching } from './fileWatcher';
import { connectToRoom } from './relayPublisher';

interface CliArgs {
  file: string;
  relay: string;
  room: string;
  intervalMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const file = get('--file');
  const relay = get('--relay');
  const room = get('--room');
  if (!file || !relay || !room) {
    throw new Error('Usage: pzmap-bridge --file <path> --relay <ws-url> --room <code> [--interval-ms 1000]');
  }

  return { file, relay, room, intervalMs: Number(get('--interval-ms') ?? 1000) };
}

export function main(argv: string[]) {
  const args = parseArgs(argv);
  console.log(`pzmap-bridge: watching ${args.file}, publishing to ${args.relay}/room/${args.room}`);

  const conn = connectToRoom(args.relay, args.room, {
    onStatus: (status, message) => console.log(`[relay] ${status}${message ? `: ${message}` : ''}`),
    onState: (publishers) => console.log(`[relay] ${publishers.length} publisher(s) in room`),
  });

  startFileWatching(() => fsReadFile(args.file, 'utf8'), args.intervalMs, {
    onPayload: (payload) => {
      console.log(`[file] publishing ${payload.players.length} player(s)`);
      conn.publish(payload);
    },
    onStatus: (status, message) => {
      if (status === 'error') console.error(`[file] ${message}`);
    },
  });

  process.on('SIGINT', () => {
    conn.close();
    process.exit(0);
  });
}
```

- [ ] **Step 2: Executable wrapper**

Create `bridge/bin/pzmap-bridge.mjs`:

```js
#!/usr/bin/env node
import { main } from '../dist/cli.js';

main(process.argv.slice(2));
```

Run: `cd bridge && npx tsc -b` (rebuild to pick up `cli.ts`)
Run (on macOS/Linux; skip on Windows, `node bin/...` doesn't need the execute bit there): `chmod +x bridge/bin/pzmap-bridge.mjs`

- [ ] **Step 3: Local integration check script**

Create `bridge/scripts/check-bridge.mjs`:

```js
// Throwaway local check: run the relay locally (cd relay && npx wrangler
// dev --port 8787) in one terminal, then `node scripts/check-bridge.mjs`
// in another (from bridge/). Writes a stand-in server payload to a temp
// file, runs the bridge CLI against it, and confirms a third WebSocket
// client in the same room receives what the bridge published.

import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const ROOM = 'bridgchk1';
const RELAY = 'ws://localhost:8787';

const dir = await mkdtemp(join(tmpdir(), 'pzmap-bridge-check-'));
const file = join(dir, 'pzmap-live-server.json');
await writeFile(file, JSON.stringify({
  v: 1,
  players: [{ id: '1', name: 'ServerPlayer', x: 100, y: 200, z: 0, updatedAt: Date.now() }],
}));

const watcher = new WebSocket(`${RELAY}/room/${ROOM}`);
const seen = await new Promise((resolve, reject) => {
  const seenStates = [];
  watcher.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      seenStates.push(msg);
      if (msg.publishers.some((p) => p.payload.players[0]?.name === 'ServerPlayer')) {
        resolve(seenStates);
      }
    }
  });
  watcher.addEventListener('error', reject);
  setTimeout(() => resolve(seenStates), 5000);
});

const bridge = spawn('node', ['bin/pzmap-bridge.mjs', '--file', file, '--relay', RELAY, '--room', ROOM, '--interval-ms', '500'], {
  stdio: 'inherit',
});

await new Promise((r) => setTimeout(r, 2000));
bridge.kill('SIGINT');
watcher.close();
await rm(dir, { recursive: true, force: true });

const ok = seen.some((s) => s.publishers.some((p) => p.payload.players[0]?.name === 'ServerPlayer'));
console.log(ok ? 'PASS' : 'FAIL: watcher never saw the bridge-published payload');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 4: Run the local integration check**

Run: `cd relay && npx wrangler dev --port 8787` (leave running in the background)
Run: `cd bridge && node scripts/check-bridge.mjs`
Expect: `PASS`.

Then stop the `wrangler dev` process.

- [ ] **Step 5: Commit**

`git add bridge/src/cli.ts bridge/bin/pzmap-bridge.mjs bridge/scripts/check-bridge.mjs`
`git commit -m "Add pzmap-bridge CLI with a local integration check"`

---

### Task 4: Workshop packaging + full docs

**Files:**
- Modify: `mod/pzmapLive/common/mod.info`
- Create: `mod/pzmapLive/WORKSHOP.md`
- Modify: `README.md`
- Modify: `bridge/package.json` (add a `description`, no version bump — still unpublished)

**Interfaces:** none — this task is documentation and metadata only, consuming nothing new.

- [ ] **Step 1: Round out mod.info**

Edit `mod/pzmapLive/common/mod.info` — it already has `name`, `id`, `author`, `description`,
`modversion`, `versionMin` from piece 1. No poster/icon image exists to reference (no binary
asset was produced by any piece of this project), so leave those lines out; note in
`WORKSHOP.md` (next step) that they're required before the Steam upload, not before local use.

No code change needed if the existing file already covers this — confirm by reading it; if
`description` doesn't yet mention the server half, extend it:

```
description=Streams your character's live position (and, on a server with the mod enabled, everyone's) to a local file that pzmap.vercel.app (or your own pzmap deployment) can read and show on the map. Solo works with no server; friends and whole-server views need a relay room, see the pzmap README.
```

- [ ] **Step 2: Workshop upload doc**

Create `mod/pzmapLive/WORKSHOP.md`:

```markdown
# Publishing pzmap Live to the Steam Workshop

This mod isn't uploaded yet — the steps below are for whoever does that (Steam Workshop
uploads happen through the in-game mod tools, using the uploader's own Steam account; nothing
in this repo can do it on your behalf).

## Before uploading

1. Add `poster.png` (512×512, PNG) and `icon.png` (128×128, PNG) to `mod/pzmapLive/common/`,
   and reference them in `mod.info`:
   ```
   poster=poster.png
   icon=icon.png
   ```
2. Confirm `mod/pzmapLive/42/media/lua/client/PzmapLiveClient.lua` and
   `mod/pzmapLive/42/media/lua/server/PzmapLiveServer.lua` have both been verified in-game (see
   the "not yet verified" notes in their commit messages) — a broken client-side script fails
   silently and nobody sees an error, so this is worth doing before a public upload, not after.

## Uploading

1. In Project Zomboid, enable Steam Workshop mod uploading in the game's mod tools (see the
   official Indie Stone modding guide for the current menu path — it moves between builds).
2. Point the uploader at `mod/pzmapLive/` (the folder containing `common/` and `42/`).
3. Paste the description below into the Workshop item's description field.
4. Publish, then copy the resulting Workshop URL into this repo's `README.md` "Live location"
   section so players can find it from the map itself.

## Workshop description (paste as-is)

pzmap Live streams your character's position to a file pzmap (https://pzmap.vercel.app) can
read and draw on the map, live, while you play.

**Solo**: install this mod, open pzmap, click "Share my location" in the sidebar, and pick your
`Zomboid/Lua/pzmap-live.json` file once. No server, no account — everything stays on your
machine and in your browser tab.

**Friends**: click "Start a room" in pzmap after sharing your location, and send the link.
Anyone who opens it sees your marker live, without installing anything themselves.

**Whole server**: server admins can enable this mod's server half and run the companion
`pzmap-bridge` tool to put every connected player on the map for anyone with the room link —
see the pzmap repo README for setup.

Unofficial fan project, not affiliated with The Indie Stone.
```

- [ ] **Step 3: README — friends and server sections**

In `README.md`, replace the "Live location (experimental)" section (added in piece 1) with the
fuller version covering all three pieces:

```markdown
### Live location (experimental)

Install the **pzmap Live** Workshop mod (`mod/pzmapLive` in this repo) and it writes your
character's position to `Zomboid/Lua/pzmap-live.json` while you play. Click "Share my
location" in the sidebar, pick that file once, and your position updates live on the map with
a "Follow me" toggle. Everything happens in your browser — no server, no account.

**Friends**: once you're sharing your own location, click "Start a room" — the URL gains a
`room=` code. Send that link to a friend and they'll see your marker live without installing
anything. This talks to a small Cloudflare relay (`relay/`); see that folder's README for how
to run one yourself (`npx wrangler dev` locally, or `wrangler deploy` to Cloudflare, which
needs your own Cloudflare account — that step isn't done for you).

**Whole server**: a server admin can enable the mod's server half (writes every online
player to the server's `Zomboid/Lua/pzmap-live-server.json`) and run the companion
`pzmap-bridge` tool (`bridge/`) to publish the whole roster into a relay room. See `bridge/`'s
README for the exact command.
```

- [ ] **Step 4: relay/ and bridge/ READMEs**

Create `relay/README.md`:

```markdown
# pzmap Live relay

Cloudflare Worker + Durable Object that lets browser tabs (and the server bridge) share live
positions inside a "room" — see `docs/plans/2026-08-08-pzmap-live-2-relay.md` for the design.

## Local development

    npm install
    npm run dev          # wrangler dev, listens on the default port wrangler picks
    npm test              # vitest, pure room logic only

## Deploying

    npm run deploy

Requires a Cloudflare account logged in via `wrangler login` — this repo doesn't do that for
you. After deploying, set `VITE_RELAY_URL=wss://<your-worker>.<your-subdomain>.workers.dev` in
the web app's environment (Vercel project settings, or a local `.env.local`).
```

Create `bridge/README.md`:

```markdown
# pzmap-bridge

Publishes a server's `pzmap-live-server.json` (written by the pzmap Live mod's server half)
into a relay room, so anyone with the room link sees the whole server live on pzmap without
installing the mod themselves.

## Setup

    npm install
    npm run build

## Run

    node bin/pzmap-bridge.mjs \
      --file /path/to/Zomboid/Lua/pzmap-live-server.json \
      --relay wss://<your-relay> \
      --room <the room code from the pzmap sidebar> \
      --interval-ms 1000   # optional, defaults to 1000

Get the room code by starting a room in pzmap's sidebar (or asking whoever manages the map to
share theirs) — the bridge joins an existing room, it doesn't create one.

Not yet published to npm, so `npx pzmap-bridge` doesn't work yet — run it from a clone of this
repo as shown above until someone publishes it under that name.
```

- [ ] **Step 5: Final verification**

Run: `npm run build` (repo root — confirms the web app still builds after README-only changes
don't affect it, and catches anything accidentally broken)
Run: `npx vitest run` (repo root)
Run: `cd relay && npx vitest run`
Run: `cd bridge && npx vitest run`
Expect: everything from pieces 1–3 still passes.

- [ ] **Step 6: Commit**

`git add mod/pzmapLive/common/mod.info mod/pzmapLive/WORKSHOP.md README.md relay/README.md bridge/README.md`
`git commit -m "Add Workshop packaging docs and relay/bridge READMEs"`

---

## Self-review notes

- Spec coverage: server-side "everyone online" file (Task 1), bridge CLI publishing it into a
  room (Tasks 2–3), Workshop packaging and description (Task 4) — all present. Actually
  publishing to npm/Cloudflare/Steam is explicitly out of scope per this plan's opening section
  and Global Constraints — flagged, not silently skipped.
- No placeholders: every Lua/TS/doc snippet is complete and correct as written.
- Name consistency checked: `startFileWatching`/`FileWatcherHandlers` (Task 2) match Task 3's
  `cli.ts` import. `connectToRoom` from `relayPublisher.ts` (Task 2, copied from piece 2's
  `relayClient.ts`) matches Task 3's import and call shape (`onStatus`/`onState`/`publish`/`close`).
