import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import { ALL_LOCATIONS } from './data/locations';
import type { Location } from './data/locations';
import { searchLocations } from './lib/search';
import { buildStreetLocations } from './lib/streets';
import { loadMapData, ALL_LAYERS } from './map/vectorLayer';
import type { LayerKey } from './map/vectorLayer';
import { pickLiveFile, startPolling } from './live/fileSource';
import type { LiveSourceStatus } from './live/fileSource';
import type { LivePlayer } from './live/protocol';
import './App.css';

export default function App() {
  const [query, setQuery] = useState('');
  const [layerVis, setLayerVis] = useState<ReadonlySet<LayerKey>>(() => new Set(ALL_LAYERS));
  const [selected, setSelected] = useState<Location | null>(null);
  const [streetLocs, setStreetLocs] = useState<Location[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const [liveStatus, setLiveStatus] = useState<LiveSourceStatus>('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [livePlayers, setLivePlayers] = useState<LivePlayer[]>([]);
  const [followEnabled, setFollowEnabled] = useState(true);
  const liveStopRef = useRef<(() => void) | null>(null);

  const handlePickLiveFile = async () => {
    try {
      const handle = await pickLiveFile();
      if (!handle) return;
      liveStopRef.current?.();
      setLiveError(null);
      liveStopRef.current = startPolling(handle, 1000, {
        onPayload: (payload) => setLivePlayers(payload.players),
        onStatus: (status, message) => {
          setLiveStatus(status);
          setLiveError(message ?? null);
          if (status === 'error') setLivePlayers([]);
        },
      });
    } catch {
      setLiveStatus('error');
      setLiveError('This browser cannot share a live location file (try Chrome or Edge).');
    }
  };

  useEffect(() => () => liveStopRef.current?.(), []);

  useEffect(() => {
    let alive = true;
    loadMapData()
      .then((data) => { if (alive) setStreetLocs(buildStreetLocations(data)); })
      .catch((err) => console.error('street data failed to load', err));
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
    <div className="app">
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
        liveStatus={liveStatus}
        liveError={liveError}
        livePlayers={livePlayers}
        followEnabled={followEnabled}
        onPickLiveFile={handlePickLiveFile}
        onToggleFollow={() => setFollowEnabled((v) => !v)}
      />
      <main className="map-main" aria-label="Knox Country map">
        <MapView
          layerVis={layerVis}
          selected={selected}
          onSelect={setSelected}
          livePlayers={livePlayers}
          followLiveId={followEnabled ? (livePlayers[0]?.id ?? null) : null}
        />
      </main>
    </div>
  );
}
