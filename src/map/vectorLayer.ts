// Canvas renderer for the extracted in-game world map (see scripts/build-map-data.mjs).
// Draws per-tile from a cell-bucketed spatial index of polygon features,
// projected through the isometric transform so it can sit underneath the
// pzmap2dzi tile pyramid and stand in for regions that are not rendered yet.

import L from 'leaflet';

export interface IsoTransform {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

export interface StreetSeg {
  n: string;
  w: number;
  p: number[]; // flat [x0,y0,x1,y1,...] world coords
}

export interface MapData {
  base: {
    water: number[][][];
    rail: number[][][];
    roads: Record<'primary' | 'secondary' | 'tertiary' | 'trail', number[][][]>;
  };
  buildings: Record<string, number[][][]>;
  forest: number[][][];
  streets: StreetSeg[];
}

// Toggleable map layers. 'streetNames' is rendered by labelLayer.ts; the rest
// select features of the schematic underlay below.
export type LayerKey =
  | 'buildings' | 'forest' | 'water' | 'rail'
  | 'primary' | 'secondary' | 'tertiary' | 'trail'
  | 'streetNames';

export const LAYER_LABELS: Record<LayerKey, string> = {
  streetNames: 'Street names',
  buildings: 'Buildings',
  primary: 'Primary roads',
  secondary: 'Secondary roads',
  tertiary: 'Minor roads',
  trail: 'Trails',
  rail: 'Railways',
  water: 'Water',
  forest: 'Forest',
};

export const ALL_LAYERS = Object.keys(LAYER_LABELS) as readonly LayerKey[];

export const CELL = 300;
export const CELLS_X = 66;
export const CELLS_Y = 53;
const WORLD_W = CELLS_X * CELL;
const WORLD_H = CELLS_Y * CELL;

let dataPromise: Promise<MapData> | null = null;

export function loadMapData(): Promise<MapData> {
  dataPromise ??= Promise.all(
    ['base', 'buildings', 'forest', 'streets'].map((n) =>
      fetch(`${import.meta.env.BASE_URL}mapdata/${n}.json`).then((r) => {
        if (!r.ok) throw new Error(`mapdata/${n}.json: HTTP ${r.status}`);
        return r.json();
      }),
    ),
  ).then(([base, buildings, forest, streets]) => ({ base, buildings, forest, streets }) as MapData);
  return dataPromise;
}

interface Style {
  fill: string;
  stroke?: string;
  /** Skip drawing when scale (screen px per world unit) is below this. */
  minScale?: number;
}

// Tuned to sit next to the game's autumn render without a hard visual break.
const STYLES: Record<string, Style> = {
  forest: { fill: '#475434' },
  water: { fill: '#5b87a6', stroke: '#6f9cbb' },
  rail: { fill: '#8a8a80', minScale: 1 / 24 },
  trail: { fill: '#8a8a68', minScale: 1 / 18 },
  tertiary: { fill: '#a8a890' },
  secondary: { fill: '#b8b8a0' },
  primary: { fill: '#cacab2' },
  Residential: { fill: '#8a8a7a', stroke: 'rgba(0,0,0,0.35)' },
  Industrial: { fill: '#98938a', stroke: 'rgba(0,0,0,0.35)' },
  RetailAndCommercial: { fill: '#a292b2', stroke: 'rgba(0,0,0,0.35)' },
  RestaurantsAndEntertainment: { fill: '#b8a078', stroke: 'rgba(0,0,0,0.35)' },
  CommunityServices: { fill: '#84a0b8', stroke: 'rgba(0,0,0,0.35)' },
  Medical: { fill: '#b87878', stroke: 'rgba(0,0,0,0.35)' },
  Other: { fill: '#8a927e', stroke: 'rgba(0,0,0,0.35)' },
};

const BUILDING_MIN_SCALE = 1 / 4;
const LAND = '#66714c';

interface Feat {
  rings: number[][];
  style: Style;
  order: number;
  maxDim: number;
  key: LayerKey;
}

const DRAW_ORDER = ['forest', 'water', 'rail', 'trail', 'tertiary', 'secondary', 'primary'];

let indexCache: Map<number, Feat[]> | null = null;

function bboxOf(rings: number[][]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < minX) minX = r[i];
      if (r[i] > maxX) maxX = r[i];
      if (r[i + 1] < minY) minY = r[i + 1];
      if (r[i + 1] > maxY) maxY = r[i + 1];
    }
  }
  return [minX, minY, maxX, maxY];
}

export function buildIndex(data: MapData): Map<number, Feat[]> {
  if (indexCache) return indexCache;
  const index = new Map<number, Feat[]>();
  let order = 0;

  const add = (rings: number[][], style: Style, key: LayerKey) => {
    const [minX, minY, maxX, maxY] = bboxOf(rings);
    const feat: Feat = { rings, style, order, maxDim: Math.max(maxX - minX, maxY - minY), key };
    const cx0 = Math.max(0, Math.floor(minX / CELL));
    const cx1 = Math.min(CELLS_X - 1, Math.floor(maxX / CELL));
    const cy0 = Math.max(0, Math.floor(minY / CELL));
    const cy1 = Math.min(CELLS_Y - 1, Math.floor(maxY / CELL));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * CELLS_X + cx;
        let arr = index.get(key);
        if (!arr) index.set(key, (arr = []));
        arr.push(feat);
      }
    }
  };

  for (const f of data.forest) { add(f, STYLES.forest, 'forest'); } order++;
  for (const f of data.base.water) { add(f, STYLES.water, 'water'); } order++;
  for (const f of data.base.rail) { add(f, STYLES.rail, 'rail'); } order++;
  for (const cls of ['trail', 'tertiary', 'secondary', 'primary'] as const) {
    for (const f of data.base.roads[cls]) add(f, STYLES[cls], cls);
    order++;
  }
  order = DRAW_ORDER.length + 1;
  for (const [cat, feats] of Object.entries(data.buildings)) {
    const style = { ...(STYLES[cat] ?? STYLES.Other), minScale: BUILDING_MIN_SCALE };
    for (const f of feats) add(f, style, 'buildings');
  }
  for (const arr of index.values()) arr.sort((a, b) => a.order - b.order);
  indexCache = index;
  return index;
}

interface VectorLayerOptions extends L.GridLayerOptions {
  index: Map<number, Feat[]>;
  iso: IsoTransform;
  getVisible: () => ReadonlySet<LayerKey>;
}

const VectorTileLayer = L.GridLayer.extend({
  createTile(coords: L.Coords): HTMLCanvasElement {
    const tileSize: number = (this as L.GridLayer).getTileSize().x;
    const canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = tileSize * dpr;
    canvas.height = tileSize * dpr;
    const ctx = canvas.getContext('2d');
    const { index, iso, getVisible } = (this as { options: VectorLayerOptions }).options;
    if (!ctx || !index) return canvas;
    const visible = getVisible();

    const kUnits = Math.pow(2, coords.z); // screen px per stored px
    const s = kUnits * dpr;
    const unitsPerTile = tileSize / kUnits; // stored px per tile
    const X0 = coords.x * unitsPerTile;
    const Y0 = coords.y * unitsPerTile;

    // World coords -> canvas px, all in one affine transform.
    ctx.setTransform(iso.sx * s, iso.sy * s, -iso.sx * s, iso.sy * s, (iso.ox - X0) * s, (iso.oy - Y0) * s);

    // Land backdrop: the world rectangle becomes a diamond under the transform.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(WORLD_W, 0);
    ctx.lineTo(WORLD_W, WORLD_H);
    ctx.lineTo(0, WORLD_H);
    ctx.closePath();
    ctx.fillStyle = LAND;
    ctx.fill();

    // Cull by cells: invert the transform for the tile corners.
    let wMinX = Infinity, wMinY = Infinity, wMaxX = -Infinity, wMaxY = -Infinity;
    for (const [X, Y] of [[X0, Y0], [X0 + unitsPerTile, Y0], [X0, Y0 + unitsPerTile], [X0 + unitsPerTile, Y0 + unitsPerTile]]) {
      const a = (X - iso.ox) / iso.sx;
      const b = (Y - iso.oy) / iso.sy;
      const wx = (a + b) / 2;
      const wy = (b - a) / 2;
      if (wx < wMinX) wMinX = wx;
      if (wx > wMaxX) wMaxX = wx;
      if (wy < wMinY) wMinY = wy;
      if (wy > wMaxY) wMaxY = wy;
    }
    const cx0 = Math.max(0, Math.floor(wMinX / CELL));
    const cx1 = Math.min(CELLS_X - 1, Math.floor(wMaxX / CELL));
    const cy0 = Math.max(0, Math.floor(wMinY / CELL));
    const cy1 = Math.min(CELLS_Y - 1, Math.floor(wMaxY / CELL));

    const seen = new Set<Feat>();
    const feats: Feat[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const arr = index.get(cy * CELLS_X + cx);
        if (!arr) continue;
        for (const f of arr) {
          if (!seen.has(f)) { seen.add(f); feats.push(f); }
        }
      }
    }
    feats.sort((a, b) => a.order - b.order);

    const featureScale = iso.sx * kUnits; // screen px per world unit (horizontal)
    const minDim = 2 / featureScale;
    const hairline = 1 / featureScale;
    for (const f of feats) {
      if (!visible.has(f.key)) continue;
      if (f.style.minScale && featureScale < f.style.minScale) continue;
      if (f.maxDim < minDim) continue;
      ctx.beginPath();
      for (const ring of f.rings) {
        ctx.moveTo(ring[0], ring[1]);
        for (let i = 2; i < ring.length; i += 2) ctx.lineTo(ring[i], ring[i + 1]);
        ctx.closePath();
      }
      ctx.fillStyle = f.style.fill;
      ctx.fill('evenodd');
      // Seal hairline gaps between cell-split segments.
      ctx.strokeStyle = f.style.stroke ?? f.style.fill;
      ctx.lineWidth = f.style.stroke ? hairline * 1.5 : hairline * 0.75;
      ctx.stroke();
    }
    return canvas;
  },
});

export function createVectorLayer(
  data: MapData,
  iso: IsoTransform,
  bounds: L.LatLngBounds,
  getVisible: () => ReadonlySet<LayerKey>,
): L.GridLayer {
  const index = buildIndex(data);
  return new (VectorTileLayer as unknown as new (opts: VectorLayerOptions) => L.GridLayer)({
    tileSize: 256,
    minZoom: -11,
    maxZoom: 3,
    bounds,
    index,
    iso,
    getVisible,
    updateWhenZooming: false,
    keepBuffer: 1,
  });
}

// ---- street hover lookup ----

let streetIndexCache: Map<number, number[]> | null = null;

export function buildStreetIndex(streets: StreetSeg[]): Map<number, number[]> {
  if (streetIndexCache) return streetIndexCache;
  const idx = new Map<number, number[]>();
  streets.forEach((s, i) => {
    const cells = new Set<number>();
    for (let j = 0; j < s.p.length; j += 2) {
      const cx = Math.floor(s.p[j] / CELL);
      const cy = Math.floor(s.p[j + 1] / CELL);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) cells.add((cy + dy) * CELLS_X + (cx + dx));
      }
    }
    for (const c of cells) {
      let arr = idx.get(c);
      if (!arr) idx.set(c, (arr = []));
      arr.push(i);
    }
  });
  streetIndexCache = idx;
  return idx;
}

function distToSegSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  const gx = x1 + t * dx - px, gy = y1 + t * dy - py;
  return gx * gx + gy * gy;
}

/** Nearest named street within `radius` world units of (x, y), or null. */
export function streetAt(data: MapData, x: number, y: number, radius: number): StreetSeg | null {
  const idx = buildStreetIndex(data.streets);
  const candidates = idx.get(Math.floor(y / CELL) * CELLS_X + Math.floor(x / CELL));
  if (!candidates) return null;
  let best: StreetSeg | null = null;
  let bestD = radius * radius;
  for (const i of candidates) {
    const s = data.streets[i];
    for (let j = 0; j + 3 < s.p.length; j += 2) {
      const d = distToSegSq(x, y, s.p[j], s.p[j + 1], s.p[j + 2], s.p[j + 3]);
      if (d < bestD) { bestD = d; best = s; }
    }
  }
  return best;
}
