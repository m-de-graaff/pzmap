# Filters & Street-Name Labels Implementation Plan

> **To execute:** use the `executing-plans` skill. Steps use `- [ ]` for tracking.

**Goal:** Add map-layer visibility toggles, rotated street-name labels above the tiles, a town filter, and per-category counts on the filter chips.

**Architecture:** Layer visibility is a `ReadonlySet<LayerKey>` owned by `App`, threaded to the Sidebar (checkbox panel) and to `MapView`, where the canvas vector layer filters features by key and redraws on change. Street names render in a **new** canvas `L.GridLayer` at `zIndex: 3` — *above* the DZI tiles (the existing vector underlay sits beneath them at `zIndex: 1`, so labels drawn there would be invisible wherever tiles exist). Town filter and chip counts are pure state/derivation changes in `App`/`Sidebar`.

**Tech stack:** Vite 8, React 19, TypeScript 6, Leaflet 1.9 (`L.GridLayer` canvas tiles). No test framework in the repo.

## Global Constraints

- **No test runner exists** (`package.json` has no test script). Each task's gate is `npm run build` (runs `tsc -b`) passing plus the stated browser checks against `npm run dev`.
- **Not a git repo** — no commit steps. Do not `git init` without asking Mark.
- Follow existing patterns: flat `[x,y,...]` coord arrays, cell-bucketed spatial indexes (`CELL = 300`, `CELLS_X = 66`), styles as plain objects in module scope, kebab-free camelCase filenames.
- Iso projection (from `src/map/vectorLayer.ts` / `MapView.tsx`): stored-px `X = iso.ox + (x − y)·iso.sx`, `Y = iso.oy + (x + y)·iso.sy`; screen px per stored px at Leaflet zoom `z` is `2^z`; **screen px per world unit** = `iso.sx · 2^z` (`iso.sx` = 32 for the B42 render).
- Leaflet zoom range is `-10.5 … 1`. Existing zoom classes: `far` below −8, `mid` below −4.5, `near` otherwise (`MapView.tsx:158`).
- UI work must load the `accessibility` skill at that task; the chip-polish task also loads `make-interfaces-feel-better`.
- All sidebar controls are keyboard-operable native elements (`button`, `input type="checkbox"`, `select`) — no div-with-onClick.

---

### Task 1: Layer visibility — vector layer + state + sidebar panel

**Files:**
- Modify: `src/map/vectorLayer.ts` (Feat tagging ~line 80–152, createTile filter ~line 222, `createVectorLayer` ~line 242)
- Modify: `src/App.tsx` (new state + props)
- Modify: `src/components/Sidebar.tsx` (new "Map layers" section after the chips block, line ~90)
- Modify: `src/components/MapView.tsx` (props, layer ref, redraw effect)
- Modify: `src/App.css` (panel styles)

**Interfaces:**
- Produces (from `vectorLayer.ts`):
  ```ts
  export type LayerKey =
    | 'buildings' | 'forest' | 'water' | 'rail'
    | 'primary' | 'secondary' | 'tertiary' | 'trail'
    | 'streetNames';
  export const LAYER_LABELS: Record<LayerKey, string>; // display names for the panel
  export const ALL_LAYERS: readonly LayerKey[];
  export function createVectorLayer(
    data: MapData, iso: IsoTransform, bounds: L.LatLngBounds,
    getVisible: () => ReadonlySet<LayerKey>,
  ): L.GridLayer;
  ```
- Produces (App state): `layerVis: ReadonlySet<LayerKey>` (initial: all of `ALL_LAYERS`), `toggleLayer(key: LayerKey)`.
- Produces (MapView prop): `layerVis: ReadonlySet<LayerKey>`.
- Produces (Sidebar props): `layerVis: ReadonlySet<LayerKey>`, `onToggleLayer: (k: LayerKey) => void`.

- [ ] **Step 1: Tag features with a `LayerKey` in `vectorLayer.ts`**

Add `key: LayerKey` to `Feat`. In `buildIndex`, pass the key through `add`:
`forest → 'forest'`, `base.water → 'water'`, `base.rail → 'rail'`, road classes → their own name, every building category → `'buildings'`. `'streetNames'` tags nothing here (used by Task 2).

```ts
export const LAYER_LABELS: Record<LayerKey, string> = {
  buildings: 'Buildings', forest: 'Forest', water: 'Water', rail: 'Railways',
  primary: 'Primary roads', secondary: 'Secondary roads', tertiary: 'Minor roads',
  trail: 'Trails', streetNames: 'Street names',
};
export const ALL_LAYERS = Object.keys(LAYER_LABELS) as readonly LayerKey[];
```

- [ ] **Step 2: Filter in `createTile` and accept `getVisible` in `createVectorLayer`**

In the feats draw loop (after the `minScale` check): `if (!visible.has(f.key)) continue;` where `const visible = this.options.getVisible()` is read once per tile. Add `getVisible` to `VectorLayerOptions`; `createVectorLayer` takes it as a 4th argument and passes it through. Land backdrop always draws.

- [ ] **Step 3: App state + thread props**

In `App.tsx`: `const [layerVis, setLayerVis] = useState<ReadonlySet<LayerKey>>(() => new Set(ALL_LAYERS));` and a `toggleLayer` mirroring `toggleCat`. Pass to both `Sidebar` and `MapView`.

- [ ] **Step 4: MapView — keep a live ref, redraw on change**

```ts
const layerVisRef = useRef(layerVis);
const vectorLayerRef = useRef<L.GridLayer | null>(null);
// in setup: createVectorLayer(data, iso, imageBounds, () => layerVisRef.current)
useEffect(() => {
  layerVisRef.current = layerVis;
  vectorLayerRef.current?.redraw();
}, [layerVis]);
```

`redraw()` re-renders visible tiles; no layer re-creation.

- [ ] **Step 5: Sidebar panel**

After the chips `div`, a collapsible section (native `<details>` keeps it keyboard-accessible for free):

```tsx
<details className="layers-panel">
  <summary>Map layers</summary>
  <div role="group" aria-label="Toggle map layers">
    {ALL_LAYERS.map((k) => (
      <label key={k} className="layer-row">
        <input type="checkbox" checked={layerVis.has(k)}
               onChange={() => onToggleLayer(k)} />
        {LAYER_LABELS[k]}
      </label>
    ))}
  </div>
</details>
```

Style in `App.css` to match the chips block (same font size, muted borders). The `streetNames` row is present but has no effect until Task 2 — acceptable within this plan.

- [ ] **Step 6: Verify**

Run: `npm run build` → expect clean. Then `npm run dev`, open the app:
- Unchecking **Forest** removes green fill from unrendered regions (pan west past the tile render's edge to see the schematic underlay).
- Unchecking **Water** removes the Ohio River from the underlay.
- Unchecking **Buildings** removes building footprints at close zoom (they only draw when `featureScale ≥ 1/4`).
- Toggles do not affect the DZI photo tiles (expected — they're a raster).
- Checkbox rows reachable by Tab, toggleable by Space.

---

### Task 2: Street-name label layer (rotated, zoom-gated, above tiles)

**Files:**
- Create: `src/map/labelLayer.ts`
- Modify: `src/map/vectorLayer.ts` (export the currently-private `buildStreetIndex`, line ~260)
- Modify: `src/components/MapView.tsx` (add the layer at `zIndex: 3`, redraw with `layerVis`)
- Modify: `src/index.css` or `App.css` only if a font preload is needed (labels use canvas, so normally no CSS)

**Interfaces:**
- Consumes: `LayerKey`/`'streetNames'`, `MapData`, `StreetSeg`, `IsoTransform`, `buildStreetIndex(streets): Map<number, number[]>` (newly exported), `layerVisRef` pattern from Task 1.
- Produces (from `labelLayer.ts`):
  ```ts
  export function createStreetLabelLayer(
    data: MapData, iso: IsoTransform, bounds: L.LatLngBounds,
    getVisible: () => ReadonlySet<LayerKey>,
  ): L.GridLayer;
  ```

- [ ] **Step 1: Export `buildStreetIndex` from `vectorLayer.ts`**

Change `function buildStreetIndex` to `export function buildStreetIndex`. No behaviour change.

- [ ] **Step 2: Write `labelLayer.ts`**

An `L.GridLayer.extend` canvas layer, same tile math as `VectorTileLayer` (`kUnits = 2^coords.z`, tile world-bbox by inverting the iso transform at the 4 corners — copy that block; it is 10 lines and the two layers legitimately duplicate it). Core drawing, per tile:

```ts
const MIN_SCALE = 1;          // screen px per world unit; labels appear from z ≈ −5
const FONT_PX = 12;

createTile(coords: L.Coords): HTMLCanvasElement {
  // ...canvas + dpr setup identical to VectorTileLayer...
  const scale = iso.sx * kUnits;               // screen px per world unit
  if (scale < MIN_SCALE || !getVisible().has('streetNames')) return canvas;

  ctx.font = `${FONT_PX * dpr}px 'Geist Variable', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const drawn = new Set<string>();             // one label per name per tile
  for (const i of candidateStreetIndices) {    // from buildStreetIndex + tile world-bbox cells
    const s = streets[i];
    if (drawn.has(s.n)) continue;
    // Project each vertex to tile px: sx = ((iso.ox + (x−y)·iso.sx) − X0)·kUnits·dpr, sy likewise with +.
    // Walk consecutive vertex pairs; keep the single longest segment whose midpoint is inside the tile.
    const seg = longestSegmentInTile(s, ...);
    if (!seg) continue;
    const w = ctx.measureText(s.n).width;
    if (seg.len < w + 16 * dpr) continue;      // street too short on screen for its name
    let ang = Math.atan2(seg.dy, seg.dx);
    if (ang > Math.PI / 2) ang -= Math.PI;     // keep text upright
    if (ang < -Math.PI / 2) ang += Math.PI;
    ctx.save();
    ctx.translate(seg.midX, seg.midY);
    ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(20, 24, 16, 0.75)';  // dark halo over the autumn palette
    ctx.lineWidth = 3 * dpr;
    ctx.strokeText(s.n, 0, 0);
    ctx.fillStyle = '#e8e6d8';
    ctx.fillText(s.n, 0, 0);
    ctx.restore();
    drawn.add(s.n);
  }
  return canvas;
}
```

`longestSegmentInTile` is a small helper in the same file: iterates `s.p` pairwise, projects to tile px, returns `{midX, midY, dx, dy, len}` for the longest chord whose midpoint lies within the tile bounds (±32 px margin so labels near seams still draw), or `null`. The per-tile draw plus the length gate is the density control — as zoom rises, more streets pass the `seg.len ≥ textWidth` test, so labels get denser naturally. Labels may repeat across distant tiles for long streets: standard tiled-map behaviour, accept it.

- [ ] **Step 3: Wire into MapView**

In the setup effect, after the DZI layer:

```ts
if (data) {
  labelLayerRef.current = createStreetLabelLayer(data, iso, imageBounds, () => layerVisRef.current)
    .setZIndex(3).addTo(map);
}
```

Layer options: `tileSize: 256, minZoom: -10.5, maxZoom: 1, bounds, updateWhenZooming: false, keepBuffer: 1`. Extend Task 1's redraw effect to also call `labelLayerRef.current?.redraw()`.

- [ ] **Step 4: Verify**

Run: `npm run build` → clean. In the browser:
- At the default fitted view (z ≈ −8): no street names.
- Zoom to Muldraugh at z ≥ −5: names appear along Dixie Highway and side streets, rotated to follow the roads, readable over both the photo tiles and the schematic underlay, never upside-down.
- Zooming closer adds names on shorter streets.
- Unchecking **Street names** in the layers panel removes all labels; re-checking restores them.
- Pan across tile seams: no label clipped mid-word at most seams (±32 px margin working).

---

### Task 3: Town filter

**Files:**
- Modify: `src/App.tsx` (state, pool filtering ~line 28–31)
- Modify: `src/components/Sidebar.tsx` (select above the chips, results header)
- Modify: `src/components/MapView.tsx` (POI marker effect, line ~213–231)
- Modify: `src/App.css` (select styles)

**Interfaces:**
- Consumes: `TOWNS` from `data/locations`, existing `results` pipeline.
- Produces (App state): `activeTown: string | null` (a `Location.name` from `TOWNS`, or null = all).
- Produces (Sidebar props): `activeTown: string | null`, `onTownChange: (t: string | null) => void`.
- Produces (MapView prop): `activeTown: string | null`.

- [ ] **Step 1: App state and pool filtering**

```ts
const [activeTown, setActiveTown] = useState<string | null>(null);
const inTown = (loc: Location) =>
  !activeTown || loc.town === activeTown || (loc.cat === 'town' && loc.name === activeTown);
const results = useMemo(() => {
  const pool = [...ALL_LOCATIONS, ...streetLocs].filter((loc) => activeCats.has(loc.cat) && inTown(loc));
  return searchLocations(query, pool);
}, [query, activeCats, streetLocs, activeTown]);
```

Streets already carry `town` via `nearestTown` (`src/lib/streets.ts:25`), so they filter for free.

- [ ] **Step 2: Sidebar select**

Above the chips row:

```tsx
<label className="town-filter">
  <span className="visually-hidden">Filter by town</span>
  <select value={activeTown ?? ''} onChange={(e) => onTownChange(e.target.value || null)}>
    <option value="">All towns</option>
    {TOWNS.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
  </select>
</label>
```

When `activeTown` is set and no search query, the default list shows that town's locations rather than all towns: in the existing `list` derivation (`Sidebar.tsx:46`), the parent now passes an already-filtered `results`-style list — keep the logic in `App` by also filtering the no-query fallback there, or simplest: keep `Sidebar` logic but filter `TOWNS` to the active town. Choose the former only if it falls out naturally; the plan's requirement is just: **with a town selected, the sidebar list and map markers show only that town's entries.**

- [ ] **Step 3: MapView markers respect the town**

Add `activeTown` to `MapView` props and to the POI-marker effect's filter and dep array:
`if (!visibleCats.has(poi.cat) || (activeTown && poi.town !== activeTown)) continue;`

- [ ] **Step 4: Verify**

Run: `npm run build` → clean. Browser:
- Select "Muldraugh": POI dots outside Muldraugh disappear from the map; searching "gun" only returns Muldraugh entries; clearing back to "All towns" restores everything.
- Select is reachable via Tab, changeable with arrow keys.

---

### Task 4: Chip polish — counts and clearer active state

**Files:**
- Modify: `src/App.tsx` (derive counts)
- Modify: `src/components/Sidebar.tsx` (chips render, line ~72–90)
- Modify: `src/App.css` (chip active/inactive styles, count badge)

**Interfaces:**
- Consumes: pool from Task 3 (`ALL_LOCATIONS + streetLocs`, town-filtered, **not** category-filtered).
- Produces (Sidebar prop): `catCounts: ReadonlyMap<Category, number>`.

- [ ] **Step 1: Derive counts in App**

```ts
const catCounts = useMemo(() => {
  const m = new Map<Category, number>();
  for (const loc of [...ALL_LOCATIONS, ...streetLocs]) {
    if (!inTown(loc)) continue;
    m.set(loc.cat, (m.get(loc.cat) ?? 0) + 1);
  }
  return m;
}, [streetLocs, activeTown]);
```

Counts ignore `activeCats` on purpose — a chip's count answers "what would this show", so it must not zero out when toggled off.

- [ ] **Step 2: Render count + state in the chip**

```tsx
<button ... className={`chip${on ? '' : ' chip-off'}`} aria-pressed={on}>
  <span className="chip-dot" ... />
  {CATEGORIES[cat].label}
  <span className="chip-count">{catCounts.get(cat) ?? 0}</span>
</button>
```

- [ ] **Step 3: CSS**

`.chip-off` — dimmed text, hollow dot (e.g. `opacity: 0.55`, dot gets `background: transparent; box-shadow: inset 0 0 0 1.5px <color>` is not possible inline — instead keep the dot but reduce its saturation via `filter: grayscale(0.6)` on the chip). Active chips get a subtle filled background. `.chip-count` — smaller, tabular-nums, muted. **Contrast check (accessibility skill):** dimmed chip text must still hit 4.5:1 against the sidebar background; verify the actual values from `App.css` when writing them, and do not let color be the only off-state signal — the pressed state is also conveyed by `aria-pressed` and the fill difference.

- [ ] **Step 4: Verify**

Run: `npm run build` → clean. Browser:
- Each chip shows a count; the Streets chip shows ~a few hundred to ~1100 depending on town filter.
- Toggling a chip off visibly dims it while its count stays put.
- Selecting a town updates the counts.
- With DevTools contrast checker (or the accessibility skill's method): off-chip label text ≥ 4.5:1.

---

## Self-review notes

- Spec coverage: layer toggles → Task 1; street-class toggles → Task 1 (road classes are layer keys); street labels → Task 2; town filter → Task 3; chip counts/active state → Task 4. ✔
- Names cross-checked: `LayerKey`, `ALL_LAYERS`, `LAYER_LABELS`, `getVisible`, `layerVisRef`, `createStreetLabelLayer`, `activeTown`, `inTown`, `catCounts` used consistently across tasks. ✔
- Order: Task 2 depends on Task 1's `LayerKey` + ref pattern; Tasks 3–4 depend only on existing code plus each other's `inTown` (Task 4 after Task 3). ✔
