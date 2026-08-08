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
import type { LivePlayer, LivePayload } from './live/protocol';
import { connectToRoom, generateRoomCode } from './live/relayClient';
import type { RoomStatus, RoomPublisher } from './live/relayClient';
import { getRoomCodeFromHash, setRoomCodeInHash } from './live/roomHash';
import { saveFileHandle, loadFileHandle, hasReadPermission, ensureReadPermission } from './live/fileHandleStore';
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

  const relayUrl = import.meta.env.VITE_RELAY_URL as string | undefined;
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus | null>(null);
  const [roomPublishers, setRoomPublishers] = useState<RoomPublisher[]>([]);
  const [myConnId, setMyConnId] = useState<string | null>(null);
  const [savedHandle, setSavedHandle] = useState<FileSystemFileHandle | null>(null);
  const roomConnRef = useRef<{ publish: (p: LivePayload) => void; close: () => void } | null>(null);

  const joinRoom = (code: string) => {
    if (!relayUrl || roomConnRef.current) return;
    setRoomCode(code);
    setRoomCodeInHash(code);
    roomConnRef.current = connectToRoom(relayUrl, code, {
      onStatus: setRoomStatus,
      onState: setRoomPublishers,
      onWelcome: setMyConnId,
    });
  };

  // Sharing always has a room behind it: whatever room the URL already named
  // (so opening a friend's link and sharing puts you both in their room), or
  // a fresh private one if none was active yet. There's no separate "start a
  // room" step — sending the link *is* the friends feature.
  const startSharing = (handle: FileSystemFileHandle) => {
    liveStopRef.current?.();
    setLiveError(null);
    saveFileHandle(handle).catch(() => {});
    liveStopRef.current = startPolling(handle, 1000, {
      onPayload: (payload) => {
        setLivePlayers(payload.players);
        roomConnRef.current?.publish(payload);
      },
      onStatus: (status, message) => {
        setLiveStatus(status);
        setLiveError(message ?? null);
        if (status === 'error') setLivePlayers([]);
      },
    });
    joinRoom(getRoomCodeFromHash() ?? generateRoomCode());
  };

  const handlePickLiveFile = async () => {
    try {
      const handle = await pickLiveFile();
      if (!handle) return;
      setSavedHandle(null);
      startSharing(handle);
    } catch {
      setLiveStatus('error');
      setLiveError('This browser cannot share a live location file (try Chrome or Edge).');
    }
  };

  // A saved handle whose permission the browser has since dropped: this is
  // gesture-triggered (a click), so requestPermission() is allowed to prompt.
  const handleResumeSharing = async () => {
    if (!savedHandle) return;
    if (await ensureReadPermission(savedHandle)) {
      setSavedHandle(null);
      startSharing(savedHandle);
    } else {
      setLiveStatus('error');
      setLiveError('Permission was not granted. Click "Share my location" to pick the file again.');
    }
  };

  const handleStopSharing = () => {
    liveStopRef.current?.();
    liveStopRef.current = null;
    setLiveStatus('idle');
    setLiveError(null);
    setLivePlayers([]);
    roomConnRef.current?.close();
    roomConnRef.current = null;
    setRoomCode(null);
    setRoomStatus(null);
    setRoomPublishers([]);
    setMyConnId(null);
    setRoomCodeInHash(null);
  };

  useEffect(() => () => liveStopRef.current?.(), []);

  // Opening a room link works whether or not you ever share your own
  // location — you still see everyone already in it. Cleanup must null the
  // ref (not just close()), or StrictMode's dev-mode mount/cleanup/remount
  // cycle leaves joinRoom's "already connected" guard pointing at a closed
  // connection and the remount never reconnects.
  useEffect(() => {
    const code = getRoomCodeFromHash();
    if (code) joinRoom(code);
    return () => {
      roomConnRef.current?.close();
      roomConnRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume a previously-picked file with no user interaction, so sharing is
  // a true one-time setup rather than something you re-grant every visit.
  // Only ever queries — never requestPermission() outside a click, since
  // browsers don't reliably grant it without one. If the browser dropped the
  // permission, surface a "Resume sharing" button instead of resuming silent
  // and failing silent.
  useEffect(() => {
    (async () => {
      const handle = await loadFileHandle();
      if (!handle) return;
      if (await hasReadPermission(handle)) {
        startSharing(handle);
      } else {
        setSavedHandle(handle);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const mergedLivePlayers: LivePlayer[] = [
    ...livePlayers,
    ...roomPublishers
      .filter(({ connId }) => connId !== myConnId)
      .flatMap(({ connId, payload }) => payload.players.map((p) => ({ ...p, id: `${connId}:${p.id}` }))),
  ];

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
        hasSavedHandle={Boolean(savedHandle)}
        onResumeSharing={handleResumeSharing}
        relayEnabled={Boolean(relayUrl)}
        roomCode={roomCode}
        roomStatus={roomStatus}
        roomMembers={roomPublishers}
        onStopSharing={handleStopSharing}
      />
      <main className="map-main" aria-label="Knox Country map">
        <MapView
          layerVis={layerVis}
          selected={selected}
          onSelect={setSelected}
          livePlayers={mergedLivePlayers}
          followLiveId={followEnabled ? (mergedLivePlayers[0]?.id ?? null) : null}
        />
      </main>
    </div>
  );
}
