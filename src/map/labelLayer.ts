// Street-name labels, drawn per-tile on canvas above the DZI pyramid
// (the schematic underlay sits below the tiles, so labels can't live there).
// Names follow the street's on-screen direction; the text-fits-the-street
// gate doubles as density control — closer zoom lets shorter streets label.

import L from 'leaflet';
import { buildStreetIndex, CELL, CELLS_X, CELLS_Y } from './vectorLayer';
import type { IsoTransform, LayerKey, MapData, StreetSeg } from './vectorLayer';

/** Screen px per world unit below which no labels draw (z ≈ −5 for B42). */
const MIN_SCALE = 1;
const FONT_PX = 12;
/** Labels whose anchor is this far (tile px) outside the tile still draw, so
 * names straddling a seam appear on both neighbours instead of neither. */
const MARGIN = 48;

interface Chord {
  midX: number;
  midY: number;
  dx: number;
  dy: number;
  len: number;
}

/** Longest single segment of `s` in tile px, or null if none lands near the tile. */
function longestSegmentInTile(
  s: StreetSeg,
  iso: IsoTransform,
  k: number, // tile px per stored px (kUnits * dpr)
  X0: number,
  Y0: number,
  tilePx: number,
): Chord | null {
  let best: Chord | null = null;
  const p = s.p;
  let ax = (iso.ox + (p[0] - p[1]) * iso.sx - X0) * k;
  let ay = (iso.oy + (p[0] + p[1]) * iso.sy - Y0) * k;
  for (let i = 2; i < p.length; i += 2) {
    const bx = (iso.ox + (p[i] - p[i + 1]) * iso.sx - X0) * k;
    const by = (iso.oy + (p[i] + p[i + 1]) * iso.sy - Y0) * k;
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    if (
      midX >= -MARGIN && midX <= tilePx + MARGIN &&
      midY >= -MARGIN && midY <= tilePx + MARGIN
    ) {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (!best || len > best.len) best = { midX, midY, dx, dy, len };
    }
    ax = bx;
    ay = by;
  }
  return best;
}

interface LabelLayerOptions extends L.GridLayerOptions {
  data: MapData;
  iso: IsoTransform;
  getVisible: () => ReadonlySet<LayerKey>;
}

const StreetLabelLayer = L.GridLayer.extend({
  createTile(coords: L.Coords): HTMLCanvasElement {
    const tileSize: number = (this as L.GridLayer).getTileSize().x;
    const canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = tileSize * dpr;
    canvas.height = tileSize * dpr;
    const { data, iso, getVisible } = (this as { options: LabelLayerOptions }).options;
    const ctx = canvas.getContext('2d');
    if (!ctx || !data) return canvas;

    const kUnits = Math.pow(2, coords.z); // screen px per stored px
    const scale = iso.sx * kUnits; // screen px per world unit
    if (scale < MIN_SCALE || !getVisible().has('streetNames')) return canvas;

    const unitsPerTile = tileSize / kUnits;
    const X0 = coords.x * unitsPerTile;
    const Y0 = coords.y * unitsPerTile;

    // Tile corners -> world bbox -> candidate cells (same inversion as vectorLayer).
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
    const idx = buildStreetIndex(data.streets);
    const candidates = new Set<number>();
    const cy1 = Math.min(CELLS_Y - 1, Math.floor(wMaxY / CELL));
    const cx1 = Math.min(CELLS_X - 1, Math.floor(wMaxX / CELL));
    for (let cy = Math.max(0, Math.floor(wMinY / CELL)); cy <= cy1; cy++) {
      for (let cx = Math.max(0, Math.floor(wMinX / CELL)); cx <= cx1; cx++) {
        const arr = idx.get(cy * CELLS_X + cx);
        if (arr) for (const i of arr) candidates.add(i);
      }
    }

    const k = kUnits * dpr;
    ctx.font = `500 ${FONT_PX * dpr}px 'Geist Variable', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const drawn = new Set<string>();
    for (const i of candidates) {
      const s = data.streets[i];
      if (drawn.has(s.n)) continue;
      const seg = longestSegmentInTile(s, iso, k, X0, Y0, tileSize * dpr);
      if (!seg) continue;
      const w = ctx.measureText(s.n).width;
      if (seg.len < w + 16 * dpr) continue;
      let ang = Math.atan2(seg.dy, seg.dx);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(seg.midX, seg.midY);
      ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(18, 22, 14, 0.75)';
      ctx.lineWidth = 3 * dpr;
      ctx.strokeText(s.n, 0, 0);
      ctx.fillStyle = '#e8e6d8';
      ctx.fillText(s.n, 0, 0);
      ctx.restore();
      drawn.add(s.n);
    }
    return canvas;
  },
});

export function createStreetLabelLayer(
  data: MapData,
  iso: IsoTransform,
  bounds: L.LatLngBounds,
  getVisible: () => ReadonlySet<LayerKey>,
): L.GridLayer {
  return new (StreetLabelLayer as unknown as new (opts: LabelLayerOptions) => L.GridLayer)({
    tileSize: 256,
    minZoom: -10.5,
    maxZoom: 1,
    bounds,
    data,
    iso,
    getVisible,
    updateWhenZooming: false,
    keepBuffer: 1,
  });
}
