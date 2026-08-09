import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WORLD, FIT_BOUNDS } from '../data/world';
import type { XY } from '../data/world';
import { loadTileSource, FALLBACK_ISO } from '../data/tilesource';
import type { TileSource } from '../data/tilesource';
import { loadMapData, createVectorLayer, streetAt } from '../map/vectorLayer';
import type { MapData, IsoTransform, LayerKey } from '../map/vectorLayer';
import { createStreetLabelLayer } from '../map/labelLayer';
import { TOWNS } from '../data/locations';
import type { Location } from '../data/locations';

const TRANSPARENT_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

interface Projection {
  project: (p: XY) => [number, number];
  unproject: (ll: { lat: number; lng: number }) => { x: number; y: number };
  /** World units per screen pixel at Leaflet zoom 0 (horizontal). */
  unitsPerPx: number;
}

function makeProjection(iso: IsoTransform): Projection {
  const { sx, sy, ox, oy } = iso;
  return {
    project: ([x, y]) => [-(oy + (x + y) * sy), ox + (x - y) * sx],
    unproject: (ll) => {
      const a = (ll.lng - ox) / sx;
      const b = (-ll.lat - oy) / sy;
      return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
    },
    unitsPerPx: 1 / sx,
  };
}

const DziTileLayer = L.TileLayer.extend({
  getTileUrl(coords: L.Coords) {
    const { source, floor } = (this as { options: { source: TileSource; floor: number } }).options;
    return source.url(source.maxLevel + coords.z, coords.x, coords.y, floor);
  },
  // DZI crops edge tiles instead of padding them; Leaflet would stretch those
  // to the full tile size and misplace everything near the map edges.
  _initTile(tile: HTMLImageElement) {
    (L.TileLayer.prototype as unknown as { _initTile(t: HTMLElement): void })._initTile.call(this, tile);
    tile.style.width = '';
    tile.style.height = '';
  },
});

function createFloorTileLayer(src: TileSource, floor: number, bounds: L.LatLngBounds): L.TileLayer {
  return new (DziTileLayer as unknown as typeof L.TileLayer)('', {
    tileSize: src.tileSize,
    minZoom: -10.5,
    maxZoom: 1,
    maxNativeZoom: 0,
    bounds,
    errorTileUrl: TRANSPARENT_TILE,
    keepBuffer: 1,
    updateWhenZooming: false,
    zIndex: 2 + (floor - src.minLayer),
    source: src,
    floor,
  } as L.TileLayerOptions & { floor: number });
}

// Floors composite as an ascending stack, not a ground+current swap: on
// floor N >= 0, every floor from 0 up through N is mounted (matching
// pzmap2dzi's own viewer, html/pzmap/map.js:setBaseLayer) so gaps in an
// upper floor's transparent tiles reveal whatever is stacked beneath.
// Basements (N < 0) stack from minLayer up through N instead, with ground
// and everything above it unmounted.
function applyFloorStack(
  map: L.Map,
  src: TileSource,
  bounds: L.LatLngBounds,
  floor: number,
  current: Map<number, L.TileLayer>,
) {
  const desired = new Set<number>();
  if (floor >= 0) {
    for (let i = 0; i <= floor; i++) desired.add(i);
  } else {
    for (let i = src.minLayer; i <= floor; i++) desired.add(i);
  }
  for (const [f, layer] of current) {
    if (!desired.has(f)) {
      map.removeLayer(layer);
      current.delete(f);
    }
  }
  for (const f of desired) {
    if (!current.has(f)) {
      const layer = createFloorTileLayer(src, f, bounds);
      layer.addTo(map);
      current.set(f, layer);
    }
  }
}

function parseHash(): { x: number; y: number; z: number } | null {
  const m = window.location.hash.match(/x=(-?\d+).*?y=(-?\d+).*?z=(-?[\d.]+)/);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) };
}

interface MapViewProps {
  layerVis: ReadonlySet<LayerKey>;
  selected: Location | null;
  onSelect: (loc: Location) => void;
  floor: number;
}

export default function MapView({ layerVis, selected, onSelect, floor }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const coordsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const projRef = useRef<Projection | null>(null);
  const dataRef = useRef<MapData | null>(null);
  const highlightRef = useRef<L.Layer | null>(null);
  const vectorLayerRef = useRef<L.GridLayer | null>(null);
  const labelLayerRef = useRef<L.GridLayer | null>(null);
  const floorLayersRef = useRef<Map<number, L.TileLayer>>(new Map());
  const tileSourceRef = useRef<TileSource | null>(null);
  const imageBoundsRef = useRef<L.LatLngBounds | null>(null);
  const layerVisRef = useRef(layerVis);
  const floorRef = useRef(floor);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Bumped when the map finishes async setup, so marker effects re-run.
  const [ready, setReady] = useState(0);
  const [tilesMissing, setTilesMissing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let map: L.Map | null = null;
    let hashTimer: number | undefined;

    Promise.all([
      loadTileSource(),
      loadMapData().catch((err) => {
        console.error('map data failed to load', err);
        return null;
      }),
    ]).then(([src, data]) => {
      if (disposed) return;
      setTilesMissing(!src);

      const iso: IsoTransform = src?.iso ?? FALLBACK_ISO.iso;
      const width = src?.width ?? FALLBACK_ISO.width;
      const height = src?.height ?? FALLBACK_ISO.height;
      const proj = makeProjection(iso);
      projRef.current = proj;
      dataRef.current = data;
      const p = proj.project;

      map = L.map(el, {
        crs: L.CRS.Simple,
        minZoom: -10.5,
        maxZoom: 1,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });
      mapRef.current = map;
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const imageBounds = L.latLngBounds([0, 0], [-height, width]);
      map.setMaxBounds(imageBounds.pad(0.1));
      if (src) {
        L.control
          .attribution({ position: 'bottomright', prefix: false })
          .addAttribution(src.attribution)
          .addTo(map);
      }

      // Schematic underlay: fills regions the tile render has not reached yet.
      if (data) {
        vectorLayerRef.current = createVectorLayer(data, iso, imageBounds, () => layerVisRef.current)
          .setZIndex(1)
          .addTo(map);
      }
      tileSourceRef.current = src;
      imageBoundsRef.current = imageBounds;
      if (src) {
        applyFloorStack(map, src, imageBounds, floorRef.current, floorLayersRef.current);
      }
      if (data) {
        labelLayerRef.current = createStreetLabelLayer(data, iso, imageBounds, () => layerVisRef.current)
          .setZIndex(1000)
          .addTo(map);
      }

      for (const town of TOWNS) {
        const label = L.marker(p([town.x, town.y]), {
          icon: L.divIcon({
            className: 'town-label-wrap',
            html: `<span class="town-label">${town.name}</span>`,
            iconSize: [0, 0],
          }),
          keyboard: false,
        }).addTo(map);
        label.on('click', () => onSelectRef.current(town));
      }

      // --- chrome: zoom-dependent label size, cursor coords, URL hash ---
      const applyZoomClass = () => {
        if (!map) return;
        const z = map.getZoom();
        el.dataset.zoom = z < -8 ? 'far' : z < -4.5 ? 'mid' : 'near';
      };
      map.on('zoomend', applyZoomClass);

      map.on('mousemove', (e: L.LeafletMouseEvent) => {
        if (!map || !projRef.current) return;
        const { x, y } = projRef.current.unproject(e.latlng);
        const out = coordsRef.current;
        if (!out) return;
        if (x < 0 || y < 0 || x > WORLD.maxX || y > WORLD.maxY) return;
        let text = `${x} x ${y}`;
        if (dataRef.current) {
          const unitsPerPx = Math.pow(2, -map.getZoom()) * projRef.current.unitsPerPx;
          const street = streetAt(dataRef.current, x, y, Math.max(6, 10 * unitsPerPx));
          if (street) text = `${street.n}  ·  ${text}`;
        }
        out.textContent = text;
      });

      map.on('moveend', () => {
        window.clearTimeout(hashTimer);
        hashTimer = window.setTimeout(() => {
          if (!map || !projRef.current) return;
          const { x, y } = projRef.current.unproject(map.getCenter());
          history.replaceState(null, '', `#x=${x}&y=${y}&z=${map.getZoom()}`);
        }, 150);
      });

      const initial = parseHash();
      if (initial) map.setView(p([initial.x, initial.y]), initial.z);
      else {
        map.fitBounds(
          L.latLngBounds(p([FIT_BOUNDS.minX, FIT_BOUNDS.minY]), p([FIT_BOUNDS.maxX, FIT_BOUNDS.maxY]))
            .extend(p([FIT_BOUNDS.maxX, FIT_BOUNDS.minY]))
            .extend(p([FIT_BOUNDS.minX, FIT_BOUNDS.maxY])),
        );
      }
      applyZoomClass();

      setReady((n) => n + 1);
    });

    return () => {
      disposed = true;
      window.clearTimeout(hashTimer);
      map?.remove();
      mapRef.current = null;
      projRef.current = null;
      highlightRef.current = null;
      vectorLayerRef.current = null;
      labelLayerRef.current = null;
      floorLayersRef.current.clear();
    };
  }, []);

  // Layer visibility: the canvas layers read layerVisRef per tile, so a
  // change only needs a redraw, not a rebuild.
  useEffect(() => {
    layerVisRef.current = layerVis;
    vectorLayerRef.current?.redraw();
    labelLayerRef.current?.redraw();
  }, [layerVis]);

  // Floor changes swap which tile layers are mounted (see applyFloorStack).
  useEffect(() => {
    floorRef.current = floor;
    const map = mapRef.current;
    const src = tileSourceRef.current;
    const bounds = imageBoundsRef.current;
    if (!map || !src || !bounds) return;
    applyFloorStack(map, src, bounds, floor, floorLayersRef.current);
  }, [floor]);

  // Fly to and highlight the current selection.
  useEffect(() => {
    const map = mapRef.current;
    const proj = projRef.current;
    if (!map || !proj) return;
    highlightRef.current?.remove();
    highlightRef.current = null;
    if (!selected) return;

    if (selected.pts?.length) {
      // Street: highlight every segment and frame them.
      const group = L.layerGroup();
      const bounds = L.latLngBounds([]);
      for (const seg of selected.pts) {
        const latlngs: [number, number][] = [];
        for (let i = 0; i < seg.length; i += 2) latlngs.push(proj.project([seg[i], seg[i + 1]]));
        L.polyline(latlngs, { color: '#f5a623', weight: 4, opacity: 0.9, interactive: false }).addTo(group);
        for (const ll of latlngs) bounds.extend(ll);
      }
      group.addTo(map);
      highlightRef.current = group;
      map.flyToBounds(bounds.pad(0.6), { duration: 0.8, maxZoom: -2 });
      return;
    }

    const target = proj.project([selected.x, selected.y]);
    const zoom = selected.cat === 'town' ? -5 : -2;
    map.flyTo(target, Math.max(map.getZoom(), zoom), { duration: 0.8 });
    highlightRef.current = L.marker(target, {
      icon: L.divIcon({ className: 'pulse-wrap', html: '<span class="pulse-ring"></span>', iconSize: [0, 0] }),
      interactive: false,
      keyboard: false,
    }).addTo(map);
  }, [selected, ready]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-container" data-zoom="far" />
      {tilesMissing && (
        <div className="tiles-note" role="status">
          Isometric tiles not rendered yet — showing the schematic preview. See the README's
          “Isometric tiles” section.
        </div>
      )}
      <div className="coords-readout" ref={coordsRef} aria-hidden="true" />
    </div>
  );
}
