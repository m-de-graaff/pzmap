import { useRef, useState } from 'react';
import { CATEGORIES, TOWNS } from '../data/locations';
import type { Location } from '../data/locations';
import { LAYER_LABELS } from '../map/vectorLayer';
import type { LayerKey } from '../map/vectorLayer';
import type { LivePlayer } from '../live/protocol';
import type { LiveSourceStatus } from '../live/fileSource';

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

export default function Sidebar({
  query, onQueryChange,
  layerVis, onToggleLayer,
  results, selected, onSelect, onClearSelection, searchRef,
  liveStatus, liveError, livePlayers, followEnabled, onPickLiveFile, onToggleFollow,
}: SidebarProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [copied, setCopied] = useState(false);

  const moveFocus = (delta: number) => {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('button.result');
    if (!items?.length) return;
    const idx = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);
    const next = idx === -1 ? 0 : Math.min(Math.max(idx + delta, 0), items.length - 1);
    items[next].focus();
  };

  const copyCoords = async (loc: Location) => {
    try {
      await navigator.clipboard.writeText(`${loc.x}x${loc.y}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the coords are visible in the card anyway */
    }
  };

  const showingSearch = query.trim().length > 0;
  const list = showingSearch ? results : TOWNS;
  const streetNamesOn = layerVis.has('streetNames');

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h1>Knox Country</h1>
        <p className="subtitle">Project Zomboid · Build 42 map</p>
      </header>

      <div className="search-row">
        <input
          ref={searchRef}
          type="search"
          className="search-input"
          placeholder="Search towns, streets, POIs…"
          aria-label="Search towns, streets and points of interest"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(+1); }
            if (e.key === 'Escape') onQueryChange('');
          }}
        />
        <kbd className="search-kbd" aria-hidden="true">/</kbd>
      </div>

      <div className="filter-bar">
        <button
          type="button"
          role="switch"
          aria-checked={streetNamesOn}
          className="switch-row"
          onClick={() => onToggleLayer('streetNames')}
        >
          <span className="switch-label">{LAYER_LABELS.streetNames}</span>
          <span className="switch-track" aria-hidden="true">
            <span className="switch-knob" />
          </span>
        </button>
      </div>

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

      {selected && (
        <section className="detail-card" aria-label={`Details for ${selected.name}`}>
          <div className="detail-head">
            <span className="chip-dot big" style={{ background: CATEGORIES[selected.cat].color }} aria-hidden="true" />
            <h2>{selected.name}</h2>
            <button type="button" className="icon-btn" aria-label="Close details" onClick={onClearSelection}>✕</button>
          </div>
          <p className="detail-meta">
            {CATEGORIES[selected.cat].label}
            {selected.town ? ` · ${selected.town}` : ''}
            {' · '}
            {selected.x} x {selected.y}
            {selected.approx ? ' (approx.)' : ''}
          </p>
          {selected.desc && <p className="detail-desc">{selected.desc}</p>}
          <div className="detail-actions">
            <button type="button" className="btn" aria-live="polite" onClick={() => copyCoords(selected)}>
              {copied ? 'Copied!' : 'Copy coords'}
            </button>
          </div>
        </section>
      )}

      <div className="results-block">
        <h2 className="results-title">{showingSearch ? 'Results' : 'Towns'}</h2>
        <div aria-live="polite" className="visually-hidden">
          {showingSearch ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}
        </div>
        <ul
          className="results-list"
          ref={listRef}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(+1); }
            if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
          }}
        >
          {list.map((loc) => (
            <li key={loc.id}>
              <button
                type="button"
                className={`result${selected?.id === loc.id ? ' is-selected' : ''}`}
                aria-current={selected?.id === loc.id ? 'true' : undefined}
                aria-label={`${loc.name}${loc.town ? `, ${loc.town}` : ''}`}
                onClick={() => onSelect(loc)}
              >
                <span className="chip-dot" style={{ background: CATEGORIES[loc.cat].color }} aria-hidden="true" />
                <span className="result-name">{loc.name}</span>
                <span className="result-sub">{loc.town ?? CATEGORIES[loc.cat].label}</span>
              </button>
            </li>
          ))}
          {showingSearch && results.length === 0 && (
            <li className="no-results">Nothing matches “{query}”. Try a town or POI name.</li>
          )}
        </ul>
      </div>

      <footer className="sidebar-footer">
        <p>
          Map, streets and isometric tiles are all rendered from the B42 game files.
          Town positions from <a href="https://pzwiki.net" target="_blank" rel="noreferrer">PZwiki</a>;
          POI spots are approximate. Unofficial fan project.
        </p>
      </footer>
    </aside>
  );
}
