# A→B Directions Implementation Plan

> **To execute:** use the `executing-plans` skill. Steps use `- [ ]` for tracking.

**Goal:** Google-Maps-style directions: pick two points (right-click menu or a "Directions" button on a selected location), route along the street network, draw the path, show distance in tiles plus approximate walk/drive time.

**Architecture:** A pure routing module builds a cached graph from `MapData.streets` (polyline vertices quantized so nearby endpoints merge into intersections) and runs A*. App owns `routeEnds` state; MapView contributes a right-click context menu and draws the route polyline; Sidebar shows a directions card with the summary. Endpoints snap to the nearest street vertex, with straight "walk to road" legs at each end.

**Tech stack:** Vite 8 + React 19 + Leaflet 1.9 (existing). Vitest (new devDependency) for the routing module only — UI tasks are verified in the browser.

## Global Constraints

- No new runtime dependencies; vitest + @types are devDependencies only.
- All colors/styling via existing tokens in `src/index.css` (`--accent` #f5a623 etc.).
- World coordinates are game tiles (`x`, `y`); distances reported in tiles.
- Speed assumptions (labeled "≈" in UI): walk 1.3 tiles/s, drive 12 tiles/s.
- `npm run build` and `npm run lint` must pass at every commit; commits follow `type(scope): subject`.

---

### Task 1: Routing module with tests

**Files:**
- Create: `src/map/routing.ts`
- Create: `src/map/routing.test.ts`
- Modify: `package.json` (add `"test": "vitest run"` script; devDeps `vitest`)

**Interfaces:**
- Consumes: `StreetSeg` from `src/map/vectorLayer.ts` (`{ n: string; p: number[] }`, `p` = flat `[x0,y0,x1,y1,…]` world coords).
- Produces:
  - `interface RoutePoint { x: number; y: number; label: string }`
  - `interface Route { pts: [number, number][]; distanceTiles: number; via: string[] }` — `pts` are world-coord waypoints from exact `from` to exact `to`; `via` = up to 3 street names by descending traveled length.
  - `function findRoute(streets: StreetSeg[], from: RoutePoint, to: RoutePoint): Route | null` — null only when the graph is empty.

- [ ] **Step 1: Install vitest and add the test script**

Run: `npm install -D vitest` then add `"test": "vitest run"` to scripts.

- [ ] **Step 2: Write failing tests**

```ts
// src/map/routing.test.ts
import { describe, expect, it } from 'vitest';
import { findRoute } from './routing';
import type { StreetSeg } from './vectorLayer';

// Two streets forming an L; their corner vertices are 4 tiles apart,
// which QUANT merges into one intersection node.
const STREETS: StreetSeg[] = [
  { n: 'Main St', p: [0, 0, 100, 0, 200, 0] },
  { n: 'Cross Rd', p: [202, 2, 200, 100, 200, 200] },
];

describe('findRoute', () => {
  it('routes along connected streets', () => {
    const r = findRoute(STREETS, { x: 0, y: 0, label: 'A' }, { x: 200, y: 200, label: 'B' });
    expect(r).not.toBeNull();
    expect(r!.distanceTiles).toBeGreaterThan(390); // ~200 across + ~200 down
    expect(r!.distanceTiles).toBeLessThan(420);
    expect(r!.via).toContain('Main St');
    expect(r!.via).toContain('Cross Rd');
  });

  it('starts and ends at the exact endpoints', () => {
    const r = findRoute(STREETS, { x: 10, y: 30, label: 'A' }, { x: 190, y: 180, label: 'B' })!;
    expect(r.pts[0]).toEqual([10, 30]);
    expect(r.pts[r.pts.length - 1]).toEqual([190, 180]);
  });

  it('falls back to a straight line when ends are on disconnected roads', () => {
    const far: StreetSeg[] = [
      { n: 'North Rd', p: [0, 0, 100, 0] },
      { n: 'South Rd', p: [0, 5000, 100, 5000] },
    ];
    const r = findRoute(far, { x: 0, y: 0, label: 'A' }, { x: 100, y: 5000, label: 'B' })!;
    expect(r.distanceTiles).toBeGreaterThan(4999); // straight-line leg bridges the gap
  });
});
```

- [ ] **Step 3: Run and watch it fail** — `npm test` → FAIL, `./routing` not found.

- [ ] **Step 4: Implement `src/map/routing.ts`**

```ts
// A* over the street network. Nodes are polyline vertices quantized to a
// QUANT-tile grid so endpoints that nearly touch become one intersection.
import type { StreetSeg } from './vectorLayer';

export interface RoutePoint { x: number; y: number; label: string }
export interface Route { pts: [number, number][]; distanceTiles: number; via: string[] }

const QUANT = 8; // tiles; merge radius for intersection detection

interface Graph {
  nodes: { x: number; y: number }[];
  /** adjacency: nodeId -> [neighborId, distance, streetName][] */
  adj: Map<number, [number, number, string][]>;
}

let graphCache: { streets: StreetSeg[]; graph: Graph } | null = null;

function buildGraph(streets: StreetSeg[]): Graph {
  if (graphCache && graphCache.streets === streets) return graphCache.graph;
  const nodes: { x: number; y: number }[] = [];
  const byCell = new Map<string, number>();
  const adj = new Map<number, [number, number, string][]>();

  const nodeAt = (x: number, y: number): number => {
    const key = `${Math.round(x / QUANT)},${Math.round(y / QUANT)}`;
    let id = byCell.get(key);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ x, y });
      byCell.set(key, id);
    }
    return id;
  };
  const link = (a: number, b: number, name: string) => {
    if (a === b) return;
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    (adj.get(a) ?? adj.set(a, []).get(a)!).push([b, d, name]);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push([a, d, name]);
  };

  for (const s of streets) {
    let prev = -1;
    for (let i = 0; i + 1 < s.p.length; i += 2) {
      const id = nodeAt(s.p[i], s.p[i + 1]);
      if (prev !== -1) link(prev, id, s.n);
      prev = id;
    }
  }
  const graph = { nodes, adj };
  graphCache = { streets, graph };
  return graph;
}

function nearestNode(g: Graph, x: number, y: number): number {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < g.nodes.length; i++) {
    const d = (g.nodes[i].x - x) ** 2 + (g.nodes[i].y - y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Binary min-heap keyed by f-score. */
class Heap {
  private a: [number, number][] = [];
  get size() { return this.a.length; }
  push(id: number, f: number) {
    const a = this.a;
    a.push([id, f]);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[p][1] <= a[i][1]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0][0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][1] < a[m][1]) m = l;
        if (r < a.length && a[r][1] < a[m][1]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function findRoute(streets: StreetSeg[], from: RoutePoint, to: RoutePoint): Route | null {
  const g = buildGraph(streets);
  if (!g.nodes.length) return null;
  const start = nearestNode(g, from.x, from.y);
  const goal = nearestNode(g, to.x, to.y);

  const gScore = new Map<number, number>([[start, 0]]);
  const cameFrom = new Map<number, [number, string]>();
  const h = (i: number) => Math.hypot(g.nodes[i].x - g.nodes[goal].x, g.nodes[i].y - g.nodes[goal].y);
  const open = new Heap();
  open.push(start, h(start));
  const done = new Set<number>();

  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (done.has(cur)) continue;
    done.add(cur);
    for (const [nb, d, name] of g.adj.get(cur) ?? []) {
      const t = gScore.get(cur)! + d;
      if (t < (gScore.get(nb) ?? Infinity)) {
        gScore.set(nb, t);
        cameFrom.set(nb, [cur, name]);
        open.push(nb, t + h(nb));
      }
    }
  }

  // Walk back; if goal was never reached, route the reachable part and
  // bridge the rest with a straight leg (disconnected network fallback).
  const chain: number[] = [];
  const viaLen = new Map<string, number>();
  let end = gScore.has(goal) ? goal : start;
  for (let n = end; ; ) {
    chain.push(n);
    const step = cameFrom.get(n);
    if (!step) break;
    viaLen.set(step[1], (viaLen.get(step[1]) ?? 0) + Math.hypot(
      g.nodes[n].x - g.nodes[step[0]].x, g.nodes[n].y - g.nodes[step[0]].y));
    n = step[0];
  }
  chain.reverse();

  const pts: [number, number][] = [[from.x, from.y]];
  for (const id of chain) pts.push([g.nodes[id].x, g.nodes[id].y]);
  pts.push([to.x, to.y]);

  let distanceTiles = 0;
  for (let i = 1; i < pts.length; i++) {
    distanceTiles += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const via = [...viaLen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
  return { pts, distanceTiles: Math.round(distanceTiles), via };
}
```

- [ ] **Step 5: Run and watch it pass** — `npm test`, plus `npm run build` and `npm run lint`.

- [ ] **Step 6: Commit** — `feat(map): street-network routing with A*`

---

### Task 2: Route state, context menu, and route drawing

**Files:**
- Modify: `src/App.tsx` (route state + computation)
- Modify: `src/components/MapView.tsx` (context menu, route polyline, A/B markers)
- Modify: `src/App.css` (`.ctx-menu` styles)

**Interfaces:**
- Consumes: `findRoute`, `RoutePoint`, `Route` from `src/map/routing.ts` (Task 1); existing `loadMapData()` (already called in App), `proj.project` inside MapView.
- Produces (App → children props):
  - `MapView`: `route: Route | null`, `onPickRouteEnd: (which: 'from' | 'to', p: RoutePoint) => void`
  - App state: `routeFrom: RoutePoint | null`, `routeTo: RoutePoint | null`; `route` computed with `useMemo` from `mapData.streets` when both ends set. App keeps raw `MapData` in state (extend the existing `loadMapData().then` to also `setMapData(data)`).

- [ ] **Step 1: App state and computation**

```tsx
const [mapData, setMapData] = useState<MapData | null>(null);       // set inside existing loadMapData().then
const [routeFrom, setRouteFrom] = useState<RoutePoint | null>(null);
const [routeTo, setRouteTo] = useState<RoutePoint | null>(null);
const route = useMemo(
  () => (mapData && routeFrom && routeTo ? findRoute(mapData.streets, routeFrom, routeTo) : null),
  [mapData, routeFrom, routeTo],
);
const pickRouteEnd = (which: 'from' | 'to', p: RoutePoint) =>
  which === 'from' ? setRouteFrom(p) : setRouteTo(p);
```

- [ ] **Step 2: Context menu in MapView**

On `map.on('contextmenu', e)`: unproject to world coords, clamp to world bounds, render a fixed-position menu (React state `{x, y, sx, sy} | null` where sx/sy are `e.containerPoint`) with two `<button>`s: "Directions from here" / "Directions to here" → `onPickRouteEnd(which, { x, y, label: `${x} x ${y}` })`, then close. Close on map `movestart`, `click`, and `Escape`. Menu is a sibling of `.map-container` inside `.map-shell`, absolutely positioned.

- [ ] **Step 3: Route layer**

New `useEffect` on `[route, ready]` mirroring the selection-highlight effect: remove previous `routeLayerRef.current`; when `route` set, build `L.layerGroup` with a dark casing polyline (`#0a0a0a`, weight 7, opacity 0.65) under an accent line (`#f5a623`, weight 4), both `interactive: false`, from `route.pts.map(p => proj.project(p))`; add small `L.circleMarker` at each end (radius 7, fillColor `#ffffff` for A, `#f5a623` for B, stroke `#0a0a0a`); `map.flyToBounds` of the polyline padded 0.3 when a route first appears.

- [ ] **Step 4: `.ctx-menu` CSS** — Vercel-style: `background: var(--panel-2)`, 1px `var(--border-strong)`, radius 8, `box-shadow: var(--shadow-raised)`, buttons full-width 32px rows, hover `var(--panel-3)`; 150ms ease color transitions.

- [ ] **Step 5: Verify in browser** — right-click twice (from/to across a town), route follows streets, A/B dots at ends. `npm run build && npm run lint`.

- [ ] **Step 6: Commit** — `feat(map): right-click directions with routed path`

---

### Task 3: Directions card + entry points in the sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx` (directions card; "Directions" button on detail card)
- Modify: `src/App.tsx` (pass `route`, `routeFrom`, `routeTo`, `onPickRouteEnd`, `onClearRoute`)
- Modify: `src/App.css` (`.route-card` styles)

**Interfaces:**
- Consumes: `Route`, `RoutePoint` from Task 1; props produced in Task 2.
- Produces: Sidebar props `route: Route | null`, `routeFrom: RoutePoint | null`, `routeTo: RoutePoint | null`, `onPickRouteEnd(which, p)`, `onClearRoute(): void` (App: sets both ends null).

- [ ] **Step 1: Detail-card button** — next to "Copy coords": `<button className="btn btn-secondary" onClick={() => onPickRouteEnd('to', { x: selected.x, y: selected.y, label: selected.name })}>Directions</button>`. `.btn-secondary`: transparent bg, 1px `var(--border-strong)` border, `var(--text)` color, hover `var(--panel-3)`.

- [ ] **Step 2: Route card** — rendered above the results block whenever `routeFrom || routeTo`:

```
From  [label or "Right-click the map…"]   ✕
To    [label or "Right-click the map…"]
────────────────────────────────────────
12,400 tiles · ≈2 h 39 m walk · ≈17 m drive
via Dixie Highway, N Main St
```

Times from `distanceTiles / 1.3` and `/ 12` seconds, formatted `h m` / `m`; `font-variant-numeric: tabular-nums`; ✕ button (reuse `.icon-btn`, `aria-label="Clear directions"`) calls `onClearRoute`. Card uses `.detail-card` styling with `aria-label="Directions"`.

- [ ] **Step 3: Accessibility pass** — card is a `<section>`; the two endpoint rows are text, not fake inputs; ✕ has its 44px hit area via `.icon-btn::after`; route summary line is inside an `aria-live="polite"` container so recomputes announce.

- [ ] **Step 4: Verify in browser** — select Muldraugh → "Directions" → right-click near the Mall → "from here": route + card render; times plausible; ✕ clears both the card and the map line. `npm run build && npm run lint`.

- [ ] **Step 5: Commit** — `feat(sidebar): directions card with distance and time estimates`

---

## Self-review notes

- Fallback behavior (disconnected graph) is defined in Task 1 and tested.
- Name consistency checked: `findRoute` / `RoutePoint` / `Route` / `onPickRouteEnd` / `onClearRoute` used identically across tasks.
- Custom pins are explicitly **out of scope** for this plan — separate plan after directions ships.
- Open risk, stated: streets.xml vertex density at intersections is unverified; if QUANT=8 leaves the graph fragmented in practice, Task 2's browser verify will show straight-line bridging — the knob is QUANT, and the fallback keeps the feature usable meanwhile.
