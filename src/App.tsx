import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { ALL_LOCATIONS } from './data/locations';
import type { Location } from './data/locations';
import { searchLocations } from './lib/search';
import { buildStreetLocations } from './lib/streets';
import { loadMapData, ALL_LAYERS } from './map/vectorLayer';
import type { LayerKey } from './map/vectorLayer';
import { loadTileSource } from './data/tilesource';
import FloorControl from './components/FloorControl';
import './App.css';

export default function App() {
  const [query, setQuery] = useState('');
  const [layerVis, setLayerVis] = useState<ReadonlySet<LayerKey>>(() => new Set(ALL_LAYERS));
  const [selected, setSelected] = useState<Location | null>(null);
  const [streetLocs, setStreetLocs] = useState<Location[]>([]);
  const [floor, setFloor] = useState(0);
  const [floorRange, setFloorRange] = useState<{ min: number; max: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadMapData()
      .then((data) => { if (alive) setStreetLocs(buildStreetLocations(data)); })
      .catch((err) => console.error('street data failed to load', err));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    loadTileSource().then((src) => {
      if (alive && src) setFloorRange({ min: src.minLayer, max: src.maxLayer - 1 });
    });
    return () => { alive = false; };
  }, []);

  const results = useMemo(
    () => searchLocations(query, [...ALL_LOCATIONS, ...streetLocs]),
    [query, streetLocs],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleLayer = (key: LayerKey) => {
    setLayerVis((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <SidebarProvider>
      <Sidebar
        query={query}
        onQueryChange={setQuery}
        layerVis={layerVis}
        onToggleLayer={toggleLayer}
        results={results}
        selected={selected}
        onSelect={setSelected}
        onClearSelection={() => setSelected(null)}
        searchRef={searchRef}
      />
      <SidebarInset className="map-main" aria-label="Knox Country map">
        <MapView layerVis={layerVis} selected={selected} onSelect={setSelected} floor={floor} />
        <SidebarTrigger className="map-sidebar-trigger" />
        <FloorControl floor={floor} onFloorChange={setFloor} range={floorRange} />
      </SidebarInset>
    </SidebarProvider>
  );
}
