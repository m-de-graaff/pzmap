# pzmap Live — Piece 1: Solo Live View Implementation Plan

> **To execute:** use the `executing-plans` skill. Steps use `- [ ]` for tracking.

**Goal:** A player can install the "pzmap Live" Workshop mod, open pzmap, point it at their
`Zomboid/Lua/pzmap-live.json` file once, and see their own character's position update live on
the map with a follow-me toggle — no server, no relay, no account.

**Architecture:** The B42 mod's client half writes a small JSON payload to
`Zomboid/Lua/pzmap-live.json` on a throttled tick. The web app never talks to the game process —
it reads that file directly via the File System Access API, polling it on an interval, and
renders the result as a marker layer in the existing Leaflet map. The payload shape
(`src/live/protocol.ts`) is the seam between the Lua side and the web side and is designed to be
reused unchanged by pieces 2 (relay) and 3 (server bridge) later — this plan does not touch
those, only defines the contract they will both speak.

**Tech stack:** Existing stack (Vite + React 19 + TS + Leaflet) plus `vitest` (new dev
dependency, for the pure-logic modules only) and the browser File System Access API
(`window.showOpenFilePicker`, `FileSystemFileHandle`) — no new runtime dependency in `src/`.
Lua targets PZ Build 42's Kahlua environment; verified against PZwiki LuaDocs and
`IsoGameCharacter`/`IsoPlayer` API pages (`getFileWriter`, `getPlayer`, `getDirectionAngle`,
`getTimestampMs`, `Events.OnTick`).

## Global Constraints

- Payload version field `v` starts at `1`. Any consumer (web app, future relay) that sees a `v`
  it doesn't recognize must ignore the payload rather than guess at its shape.
- World coordinates written by the mod and read by the web app are raw PZ tile coordinates
  (integers), matching the existing convention documented in `README.md` ("World coordinates are
  game tile coordinates").
- The mod writes via `getFileWriter(filename, true, false)`, which resolves to
  `<Zomboid>/Lua/<filename>` — confirmed against PZ modding docs (MrBounty/PZ-Mod---Doc,
  `Save data.md`). Filename: `pzmap-live.json`.
- No mod options / settings UI in this piece (deferred — B42's native options API isn't stable
  enough in current LuaDocs coverage to commit to specific method names without in-game
  verification this environment can't do). Interval is a hardcoded Lua constant with a
  code comment marking it as the future options hook.
- This repo has no test runner yet. Add `vitest` as a devDependency and a `"test": "vitest run"`
  script in `package.json`; do not add React Testing Library or jsdom — no task in this plan
  needs DOM rendering under test (see per-task notes on manual verification instead).
- Follow existing code conventions: named exports, `interface` for object shapes, `type` for
  unions (see `src/map/vectorLayer.ts`), CSS custom properties from `App.css` (`--panel`,
  `--border`, `--text`, `--text-dim`, `--text-faint`), and the existing `role="switch"` pattern
  in `src/components/Sidebar.tsx:74-85` for any new toggle.

---

### Task 1: Live payload protocol + vitest setup

**Files:**
- Create: `src/live/protocol.ts`
- Create: `src/live/protocol.test.ts`
- Modify: `package.json` (add `vitest` devDependency, add `"test": "vitest run"` script)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces:
  - `export const LIVE_PROTOCOL_VERSION = 1`
  - `export interface LivePlayer { id: string; name: string; x: number; y: number; z: number; facing?: number; updatedAt: number }`
  - `export interface LivePayload { v: number; players: LivePlayer[] }`
  - `export function parseLivePayload(raw: unknown): LivePayload | null` — returns `null` if
    `raw` isn't an object, `v !== LIVE_PROTOCOL_VERSION`, or `players` isn't an array. Filters
    out (does not reject the whole payload for) individual entries in `players` missing any of
    `id`, `name`, `x`, `y`, `z`, `updatedAt` or having the wrong type for any of those fields.
    `facing` is kept only if it's a `number`, dropped (left `undefined`) otherwise.

- [ ] **Step 1: Add vitest and write the config**

Run: `npm install -D vitest`

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

Add to `package.json` `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing tests**

Create `src/live/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseLivePayload, LIVE_PROTOCOL_VERSION } from './protocol';

const validPlayer = { id: '1', name: 'Kate', x: 100, y: 200, z: 0, updatedAt: 1000 };

describe('parseLivePayload', () => {
  it('accepts a well-formed payload', () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [validPlayer] };
    expect(parseLivePayload(payload)).toEqual(payload);
  });

  it('keeps a numeric facing field', () => {
    const payload = { v: 1, players: [{ ...validPlayer, facing: 90.5 }] };
    expect(parseLivePayload(payload)?.players[0].facing).toBe(90.5);
  });

  it('drops a non-numeric facing field instead of rejecting the player', () => {
    const payload = { v: 1, players: [{ ...validPlayer, facing: 'north' }] };
    const result = parseLivePayload(payload);
    expect(result?.players).toHaveLength(1);
    expect(result?.players[0].facing).toBeUndefined();
  });

  it('rejects non-object input', () => {
    expect(parseLivePayload(null)).toBeNull();
    expect(parseLivePayload('nope')).toBeNull();
    expect(parseLivePayload(42)).toBeNull();
  });

  it('rejects an unrecognized protocol version', () => {
    expect(parseLivePayload({ v: 2, players: [validPlayer] })).toBeNull();
  });

  it('rejects a payload with no players array', () => {
    expect(parseLivePayload({ v: 1 })).toBeNull();
    expect(parseLivePayload({ v: 1, players: 'nope' })).toBeNull();
  });

  it('filters out malformed player entries but keeps the good ones', () => {
    const payload = {
      v: 1,
      players: [validPlayer, { id: '2', name: 'Bad' /* missing x/y/z/updatedAt */ }],
    };
    const result = parseLivePayload(payload);
    expect(result?.players).toEqual([validPlayer]);
  });

  it('returns an empty players array when all entries are malformed', () => {
    const payload = { v: 1, players: [{ id: '2' }] };
    expect(parseLivePayload(payload)).toEqual({ v: 1, players: [] });
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `npx vitest run src/live/protocol.test.ts`
Expect: FAIL — `Cannot find module './protocol'` (file doesn't exist yet).

- [ ] **Step 4: Implement**

Create `src/live/protocol.ts`:

```ts
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

- [ ] **Step 5: Run it, confirm it passes**

Run: `npx vitest run src/live/protocol.test.ts`
Expect: PASS, 7 tests.

- [ ] **Step 6: Commit**

`git add package.json package-lock.json vitest.config.ts src/live/protocol.ts src/live/protocol.test.ts`
`git commit -m "Add live payload protocol and vitest"`

---

### Task 2: pzmap Live mod — client half (Lua)

**Files:**
- Create: `mod/pzmapLive/common/mod.info`
- Create: `mod/pzmapLive/42/media/lua/client/PzmapLiveClient.lua`

**Interfaces:**
- Consumes: the `LivePayload`/`LivePlayer` shape from Task 1 (mirrored by hand in Lua — Lua
  can't import the TS module, so the JSON string built here must match that shape field-for-field).
- Produces: the file `Zomboid/Lua/pzmap-live.json`, written every `WRITE_INTERVAL_MS` while the
  game is running, containing exactly one entry in `players` (the local player).

No automated test — this file only runs inside the PZ game process, which this environment
cannot launch. Verification is manual review against confirmed API signatures (see below) plus
a runtime check the user performs by installing the mod and confirming the file appears and
updates. That runtime check is out of scope for this plan (no PZ session available here) —
note it as a follow-up in the task's commit message.

- [ ] **Step 1: mod.info**

Create `mod/pzmapLive/common/mod.info`:

```
name=pzmap Live
id=pzmapLive
author=m-de-graaff
description=Streams your character's live position to a local file that pzmap.vercel.app (or your own pzmap deployment) can read and show on the map. No server required for solo use.
modversion=1
versionMin=42.0.0
```

(No `poster=`/`icon=` line yet — add once real artwork exists; Workshop upload requires them,
local testing does not.)

- [ ] **Step 2: Client Lua**

Create `mod/pzmapLive/42/media/lua/client/PzmapLiveClient.lua`:

```lua
-- Writes the local player's position to Zomboid/Lua/pzmap-live.json on a
-- throttled tick, in the protocol described in src/live/protocol.ts
-- (pzmap web repo). WRITE_INTERVAL_MS is a placeholder for a future mod
-- options setting (see plan piece 1, Global Constraints).

local FILE_NAME = "pzmap-live.json"
local WRITE_INTERVAL_MS = 1000
local PROTOCOL_VERSION = 1

local lastWriteMs = 0

local function escapeJSON(str)
    return (str:gsub('[\\"]', '\\%0'):gsub('\n', '\\n'))
end

local function writePayload(player)
    local writer = getFileWriter(FILE_NAME, true, false)
    if not writer then return end

    local id = tostring(player:getOnlineID())
    local name = escapeJSON(player:getUsername() or "Survivor")
    local x = math.floor(player:getX())
    local y = math.floor(player:getY())
    local z = math.floor(player:getZ())
    local facing = player:getDirectionAngle() or 0
    local updatedAt = math.floor(os.time() * 1000)

    local json = string.format(
        '{"v":%d,"players":[{"id":"%s","name":"%s","x":%d,"y":%d,"z":%d,"facing":%.1f,"updatedAt":%d}]}',
        PROTOCOL_VERSION, id, name, x, y, z, facing, updatedAt
    )

    writer:write(json)
    writer:close()
end

local function onTick()
    local now = getTimestampMs()
    if now - lastWriteMs < WRITE_INTERVAL_MS then return end
    lastWriteMs = now

    local player = getPlayer()
    if not player then return end

    writePayload(player)
end

Events.OnTick.Add(onTick)
```

API signatures used, each confirmed against PZ modding documentation before writing this plan:
`getFileWriter(filename, true, false)` writes to `<Zomboid>/Lua/<filename>` (MrBounty/PZ-Mod---Doc,
`Save data.md`); `getPlayer()` returns the local `IsoPlayer`; `IsoGameCharacter:getDirectionAngle()`
returns forward-facing degrees (PZ modding JavaDoc, `IsoGameCharacter`); `getTimestampMs()` and
`Events.OnTick.Add` are both standard, long-documented PZ Lua APIs.

- [ ] **Step 3: Manual review pass**

Read the file back and check: every `local` is declared before use, `string.format` field order
matches `writer:write` call, no trailing comma in the JSON template, `escapeJSON` runs before
interpolation (so a player name containing `"` can't break the JSON). This step has no command
to run — it's a deliberate re-read, not a placeholder for one.

- [ ] **Step 4: Commit**

`git add mod/pzmapLive`
`git commit -m "Add pzmap Live mod client half (writes local player position)"`

Note in the commit body: "Not yet verified in-game — no PZ session available in this
environment. Verify manually: install as a local mod, enable in-game, confirm
Zomboid/Lua/pzmap-live.json appears and its updatedAt/x/y advance while playing."

---

### Task 3: Browser file source (File System Access polling)

**Files:**
- Create: `src/live/fileSource.ts`
- Create: `src/live/fileSource.test.ts`

**Interfaces:**
- Consumes: `parseLivePayload`, `LivePayload` from `src/live/protocol.ts` (Task 1).
- Produces:
  - `export type LiveSourceStatus = 'idle' | 'reading' | 'error'`
  - `export interface LiveFileSourceHandlers { onPayload: (payload: LivePayload) => void; onStatus: (status: LiveSourceStatus, message?: string) => void }`
  - `export async function pickLiveFile(): Promise<FileSystemFileHandle | null>` — wraps
    `window.showOpenFilePicker`; returns `null` if the user cancels (catches `AbortError`
    specifically, re-throws anything else).
  - `export function startPolling(handle: FileSystemFileHandle, intervalMs: number, handlers: LiveFileSourceHandlers): () => void` —
    returns a `stop` function. Reads the file every `intervalMs`; on success calls
    `onStatus('reading')` then `onPayload`; on JSON-parse failure or `parseLivePayload` returning
    `null`, calls `onStatus('error', message)` and does **not** call `onPayload` (last-known-good
    payload stays on screen — the caller's job, not this module's).

`FileSystemFileHandle` isn't available in Node/vitest, so tests use a minimal fake implementing
only the `.getFile()` method this module actually calls, matching how the real browser type is
consumed rather than mocking the whole API surface.

- [ ] **Step 1: Write the failing tests**

Create `src/live/fileSource.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPolling } from './fileSource';
import { LIVE_PROTOCOL_VERSION } from './protocol';

function fakeHandle(textForCall: (call: number) => string) {
  let call = 0;
  return {
    getFile: async () => ({
      text: async () => textForCall(call++),
    }),
  } as unknown as FileSystemFileHandle;
}

describe('startPolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads on an interval and reports valid payloads', async () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [] };
    const handle = fakeHandle(() => JSON.stringify(payload));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    const stop = startPolling(handle, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledWith(payload);
    expect(onStatus).toHaveBeenCalledWith('reading');

    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onPayload).toHaveBeenCalledTimes(2);
  });

  it('reports an error and skips onPayload on invalid JSON', async () => {
    const handle = fakeHandle(() => '{not json');
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startPolling(handle, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onPayload).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('reports an error and skips onPayload on a payload that fails validation', async () => {
    const handle = fakeHandle(() => JSON.stringify({ v: 99, players: [] }));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startPolling(handle, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onPayload).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('keeps polling after a transient error clears', async () => {
    const good = { v: LIVE_PROTOCOL_VERSION, players: [] };
    const handle = fakeHandle((call) => (call === 0 ? '{bad' : JSON.stringify(good)));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startPolling(handle, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledWith(good);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/live/fileSource.test.ts`
Expect: FAIL — `Cannot find module './fileSource'`.

- [ ] **Step 3: Implement**

Create `src/live/fileSource.ts`:

```ts
import { parseLivePayload } from './protocol';
import type { LivePayload } from './protocol';

export type LiveSourceStatus = 'idle' | 'reading' | 'error';

export interface LiveFileSourceHandlers {
  onPayload: (payload: LivePayload) => void;
  onStatus: (status: LiveSourceStatus, message?: string) => void;
}

export async function pickLiveFile(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'pzmap Live file', accept: { 'application/json': ['.json'] } }],
      excludeAcceptAllOption: false,
    });
    return handle;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export function startPolling(
  handle: FileSystemFileHandle,
  intervalMs: number,
  { onPayload, onStatus }: LiveFileSourceHandlers,
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const file = await handle.getFile();
      const text = await file.text();
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

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run src/live/fileSource.test.ts`
Expect: PASS, 4 tests.

- [ ] **Step 5: Add the File System Access API types**

`window.showOpenFilePicker` isn't in TS's default DOM lib. Add to `src/vite-env.d.ts` (create if
it doesn't already declare this):

```ts
interface FileSystemFileHandle {
  getFile(): Promise<File>;
}

interface OpenFilePickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
```

Check `src/vite-env.d.ts` first — if it only has the default `/// <reference types="vite/client" />`
line, append the above; if it doesn't exist, create it with both the reference line and this
block.

Run: `npm run build`
Expect: no new TS errors.

- [ ] **Step 6: Commit**

`git add src/live/fileSource.ts src/live/fileSource.test.ts src/vite-env.d.ts`
`git commit -m "Add browser file-source polling for live payloads"`

---

### Task 4: Live marker layer + follow mode in MapView

**Files:**
- Modify: `src/components/MapView.tsx`

**Interfaces:**
- Consumes: `LivePlayer` from `src/live/protocol.ts` (Task 1).
- Produces: new `MapViewProps` fields —
  `livePlayers: LivePlayer[]` and `followLiveId: string | null` — consumed by App (Task 6).

No automated test (Leaflet requires a real DOM/canvas; this repo has no jsdom setup and adding
one for a single layer isn't proportionate — see Global Constraints). Verified manually: run
`npm run dev`, and in the browser console execute a small script that fabricates a `livePlayers`
array via React DevTools or a temporary debug prop, confirmed against the running map. Concretely,
this task's manual check is done in Task 6's step once the Sidebar can trigger it end-to-end
through the actual file-picker flow — Task 4 alone is reviewed by reading the diff against the
existing `poiLayerRef` pattern it mirrors (`MapView.tsx:233-250`).

- [ ] **Step 1: Add props and a live layer ref**

In `src/components/MapView.tsx`, add the import and prop:

```ts
import type { LivePlayer } from '../live/protocol';
```

Extend `MapViewProps`:

```ts
interface MapViewProps {
  layerVis: ReadonlySet<LayerKey>;
  selected: Location | null;
  onSelect: (loc: Location) => void;
  livePlayers: LivePlayer[];
  followLiveId: string | null;
}
```

Update the function signature: `export default function MapView({ layerVis, selected, onSelect, livePlayers, followLiveId }: MapViewProps)`.

Add a ref alongside `poiLayerRef` (around line 69): `const liveLayerRef = useRef<L.LayerGroup | null>(null);`

In the setup effect, right after `poiLayerRef.current = L.layerGroup().addTo(map);` (line 208),
add: `liveLayerRef.current = L.layerGroup().addTo(map);`

In the cleanup function (line 212-222), add: `liveLayerRef.current = null;`

- [ ] **Step 2: Render live markers on payload change**

Add a new effect after the POI effect (after line 250):

```ts
useEffect(() => {
  const layer = liveLayerRef.current;
  const proj = projRef.current;
  if (!layer || !proj) return;
  layer.clearLayers();
  for (const p of livePlayers) {
    const marker = L.circleMarker(proj.project([p.x, p.y]), {
      radius: 7,
      color: '#0a0a0a',
      weight: 2,
      fillColor: '#4caf50',
      fillOpacity: 1,
    });
    marker.bindTooltip(p.name, { direction: 'top', offset: [0, -7], permanent: true, className: 'live-label' });
    layer.addLayer(marker);
  }
}, [livePlayers, ready]);
```

- [ ] **Step 3: Follow mode**

Add a third effect after the one from Step 2:

```ts
useEffect(() => {
  const map = mapRef.current;
  const proj = projRef.current;
  if (!map || !proj || !followLiveId) return;
  const target = livePlayers.find((p) => p.id === followLiveId);
  if (!target) return;
  map.panTo(proj.project([target.x, target.y]), { animate: true, duration: 0.4 });
}, [livePlayers, followLiveId]);
```

- [ ] **Step 4: Style the live label**

In `src/App.css`, find the `.pulse-ring`/marker-related rules (search for `pulse-ring`) and add
nearby:

```css
.live-label {
  background: var(--panel);
  border: 1px solid var(--border-strong);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 6px;
}
```

- [ ] **Step 5: Build check**

Run: `npm run build`
Expect: succeeds (this also verifies the new props compile against a not-yet-updated `App.tsx` —
if it fails because `App.tsx` doesn't pass the new required props yet, that's expected and
resolved in Task 6; if so, temporarily default them in `App.tsx` isn't needed — just proceed to
Task 6 next since these tasks are sequential and Task 5/6 supply the missing prop wiring before
the next commit boundary).

- [ ] **Step 6: Commit**

`git add src/components/MapView.tsx src/App.css`
`git commit -m "Add live marker layer and follow mode to MapView"`

---

### Task 5: Live panel in Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `LivePlayer` from `src/live/protocol.ts`, `LiveSourceStatus` from `src/live/fileSource.ts`.
- Produces: new `SidebarProps` fields —
  `liveStatus: LiveSourceStatus`, `liveError: string | null`, `livePlayers: LivePlayer[]`,
  `followEnabled: boolean`, `onPickLiveFile: () => void`, `onToggleFollow: () => void`.

No automated test (presentational JSX wired to props already covered by Task 3's logic tests;
DOM rendering is out of scope per Global Constraints). Verified manually together with Task 6.

- [ ] **Step 1: Extend props**

In `src/components/Sidebar.tsx`, add imports:

```ts
import type { LivePlayer } from '../live/protocol';
import type { LiveSourceStatus } from '../live/fileSource';
```

Extend `SidebarProps`:

```ts
interface SidebarProps {
  query: string;
  onQueryChange: (q: string) => void;
  layerVis: ReadonlySet<LayerKey>;
  onToggleLayer: (key: LayerKey) => void;
  results: Location[];
  selected: Location | null;
  onSelect: (loc: Location) => void;
  onClearSelection: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  liveStatus: LiveSourceStatus;
  liveError: string | null;
  livePlayers: LivePlayer[];
  followEnabled: boolean;
  onPickLiveFile: () => void;
  onToggleFollow: () => void;
}
```

Destructure the new props in the function signature alongside the existing ones.

- [ ] **Step 2: Add the Live panel markup**

Insert a new section after the `.filter-bar` block (after line 86, before the `{selected && (...)}`
block):

```tsx
<div className="live-panel">
  <div className="live-panel-head">
    <span className="live-panel-title">Live location</span>
    {liveStatus === 'reading' && livePlayers.length > 0 && (
      <span className="live-dot" aria-hidden="true" />
    )}
  </div>
  {livePlayers.length === 0 ? (
    <button type="button" className="btn" onClick={onPickLiveFile}>
      {liveStatus === 'idle' ? 'Share my location' : 'Choose file again'}
    </button>
  ) : (
    <button
      type="button"
      role="switch"
      aria-checked={followEnabled}
      className="switch-row"
      onClick={onToggleFollow}
    >
      <span className="switch-label">Follow me</span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  )}
  {liveStatus === 'error' && liveError && (
    <p className="live-error" role="alert">{liveError}</p>
  )}
  {livePlayers.length === 0 && liveStatus === 'idle' && (
    <p className="live-hint">
      Requires the <strong>pzmap Live</strong> Workshop mod. Pick your
      <code>Zomboid/Lua/pzmap-live.json</code> file once — it stays selected for this browser
      tab.
    </p>
  )}
</div>
```

- [ ] **Step 3: Style it**

In `src/App.css`, add after the `.filter-bar` rules (search for `.filter-bar` to find the block):

```css
.live-panel {
  padding: 4px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.live-panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.live-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4caf50;
}

.live-error {
  margin: 0;
  font-size: 12px;
  color: #ef5350;
}

.live-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
}

.live-hint code {
  font-size: 11px;
  background: var(--panel-2);
  padding: 1px 4px;
  border-radius: 4px;
}
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expect: fails only on `App.tsx` not yet supplying the new required props — resolved next in
Task 6. If it fails for any other reason (typo, wrong import path), fix before proceeding.

- [ ] **Step 5: Commit**

`git add src/components/Sidebar.tsx src/App.css`
`git commit -m "Add live location panel to Sidebar"`

---

### Task 6: Wire it together in App + README docs

**Files:**
- Modify: `src/App.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything produced by Tasks 1–5 (`parseLivePayload` types, `pickLiveFile`,
  `startPolling`, the new `MapView`/`Sidebar` props).
- Produces: nothing new consumed elsewhere — this is the top of the tree for this feature.

- [ ] **Step 1: Add live state to App**

In `src/App.tsx`, add imports:

```ts
import { pickLiveFile, startPolling } from './live/fileSource';
import type { LiveSourceStatus } from './live/fileSource';
import type { LivePlayer } from './live/protocol';
```

Add state, after the existing `useState` calls:

```ts
const [liveStatus, setLiveStatus] = useState<LiveSourceStatus>('idle');
const [liveError, setLiveError] = useState<string | null>(null);
const [livePlayers, setLivePlayers] = useState<LivePlayer[]>([]);
const [followEnabled, setFollowEnabled] = useState(true);
const liveStopRef = useRef<(() => void) | null>(null);
```

Add the picker handler:

```ts
const handlePickLiveFile = async () => {
  const handle = await pickLiveFile();
  if (!handle) return;
  liveStopRef.current?.();
  setLiveError(null);
  liveStopRef.current = startPolling(handle, 1000, {
    onPayload: (payload) => setLivePlayers(payload.players),
    onStatus: (status, message) => {
      setLiveStatus(status);
      setLiveError(message ?? null);
    },
  });
};
```

Add cleanup on unmount, in a new effect:

```ts
useEffect(() => () => liveStopRef.current?.(), []);
```

- [ ] **Step 2: Pass props through**

Update the `<Sidebar>` element to add:

```tsx
liveStatus={liveStatus}
liveError={liveError}
livePlayers={livePlayers}
followEnabled={followEnabled}
onPickLiveFile={handlePickLiveFile}
onToggleFollow={() => setFollowEnabled((v) => !v)}
```

Update the `<MapView>` element to add:

```tsx
livePlayers={livePlayers}
followLiveId={followEnabled ? (livePlayers[0]?.id ?? null) : null}
```

- [ ] **Step 3: Build and lint**

Run: `npm run build`
Expect: succeeds with no TS errors.

Run: `npm run lint`
Expect: no new warnings/errors.

Run: `npx vitest run`
Expect: all 11 tests from Tasks 1 and 3 still pass.

- [ ] **Step 4: Manual browser verification**

Run `npm run dev`, open the app. Click "Share my location" — the browser's native file picker
should appear (this confirms the File System Access wiring compiles and runs; it cannot be
driven further without a real `pzmap-live.json` file, which requires the mod running inside PZ).
To verify the rendering path without the game, temporarily create
`C:\Users\Mark\Zomboid\Lua\pzmap-live-test.json` by hand with a valid payload
(`{"v":1,"players":[{"id":"1","name":"Test","x":11000,"y":9000,"z":0,"updatedAt":0}]}`, using a
real in-bounds coordinate from an existing town in `src/data/locations.ts`), pick that file, and
confirm a green circle marker with a "Test" label appears at that location and "Follow me" pans
the map when you edit and re-save the file. Delete the test file afterward.

- [ ] **Step 5: Update README**

In `README.md`, add a new subsection under `## Features` (after the existing bullet list, before
`## Getting started`):

```markdown
### Live location (experimental)

Install the **pzmap Live** Workshop mod (`mod/pzmapLive` in this repo) and it writes your
character's position to `Zomboid/Lua/pzmap-live.json` while you play. Click "Share my
location" in the sidebar, pick that file once, and your position updates live on the map with
a "Follow me" toggle. Everything happens in your browser — no server, no account. (Friends'
locations and whole-server views are a planned follow-up; see `docs/plans/`.)
```

- [ ] **Step 6: Commit**

`git add src/App.tsx README.md`
`git commit -m "Wire live location panel into App; document the feature"`

---

## Self-review notes (for the executor to re-check, not to re-litigate)

- Spec coverage: mod client half (Task 2), solo browser view with polling (Tasks 1, 3, 4),
  follow-me toggle (Task 4 step 3, Task 5 step 2), onboarding hint text (Task 5 step 2) — all
  present. Friends rooms and server bridge are explicitly out of scope (pieces 2 and 3).
- No placeholders: every Lua and TS snippet above is complete, runnable code, not a sketch.
- Name consistency checked: `LivePlayer`/`LivePayload`/`parseLivePayload` (Task 1) are the exact
  names imported in Tasks 3, 4, 5, 6. `startPolling`/`pickLiveFile`/`LiveSourceStatus` (Task 3)
  match their Task 6 imports.
