// Isometric tile pyramid rendered from the local Project Zomboid B42 install
// with pzmap2dzi (see README "Isometric tiles"). Served at /tiles/ by the
// dev-server middleware in vite.config.ts.
//
// The pyramid's map_info.json carries the projection constants:
//   full-res px = x0 + (x - y) * sqr/2
//   full-res py = y0 + (x + y) * sqr/4
// and the stored image is full resolution divided by 2^skip.

export interface TileSource {
  url: (level: number, col: number, row: number, layer: number) => string;
  width: number;
  height: number;
  tileSize: number;
  maxLevel: number;
  minLayer: number;
  maxLayer: number;
  attribution: string;
  iso: { sx: number; sy: number; ox: number; oy: number };
}

interface MapInfo {
  w: number;
  h: number;
  skip?: number;
  x0: number;
  y0: number;
  sqr: number;
  pz_version?: string;
  minlayer?: number;
  maxlayer?: number;
}

/**
 * Projection constants of the local B42 render — used when the tile pyramid
 * (and its map_info.json) is not available, so the schematic underlay can
 * still draw in the same isometric space.
 */
export const FALLBACK_ISO = {
  width: 1157184,
  height: 505840,
  iso: { sx: 32, sy: 16, ox: 518144, oy: -71696 },
} as const;

let sourcePromise: Promise<TileSource | null> | null = null;

export function loadTileSource(): Promise<TileSource | null> {
  sourcePromise ??= (async () => {
    try {
      // VITE_TILE_BASE points at a remote tile host (e.g. an R2 bucket) in
      // production; without it the dev-server middleware serves /tiles locally.
      const base = (import.meta.env.VITE_TILE_BASE ?? `${import.meta.env.BASE_URL}tiles`).replace(/\/$/, '');
      const res = await fetch(`${base}/map_info.json`);
      if (!res.ok) return null;
      const info: MapInfo = await res.json();
      const div = 2 ** (info.skip ?? 0);
      return {
        // Layer 0 (ground) is rendered as jpg (image_fmt_base_layer0 in
        // pzmap2dzi conf); every other floor uses image_fmt (webp), which
        // supports the transparency floor compositing relies on.
        url: (level, col, row, layer) => {
          const ext = layer === 0 ? 'jpg' : 'webp';
          return `${base}/layer${layer}_files/${level}/${col}_${row}.${ext}`;
        },
        width: info.w,
        height: info.h,
        tileSize: 1024,
        maxLevel: Math.ceil(Math.log2(Math.max(info.w, info.h))),
        minLayer: info.minlayer ?? 0,
        maxLayer: info.maxlayer ?? 1,
        attribution: `Rendered from ${info.pz_version ?? 'PZ'} game files with pzmap2dzi · assets © The Indie Stone`,
        iso: {
          sx: info.sqr / 2 / div,
          sy: info.sqr / 4 / div,
          ox: info.x0 / div,
          oy: info.y0 / div,
        },
      };
    } catch {
      return null;
    }
  })();
  return sourcePromise;
}
