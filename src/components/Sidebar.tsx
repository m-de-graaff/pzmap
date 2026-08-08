import { useRef, useState } from 'react';
import { CATEGORIES, TOWNS } from '../data/locations';
import type { Location } from '../data/locations';
import { LAYER_LABELS } from '../map/vectorLayer';
import type { LayerKey } from '../map/vectorLayer';
import {
  Sidebar as SidebarRoot,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
}

export default function Sidebar({
  query, onQueryChange,
  layerVis, onToggleLayer,
  results, selected, onSelect, onClearSelection, searchRef,
}: SidebarProps) {
  const listRef = useRef<HTMLDivElement>(null);
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
    <SidebarRoot collapsible="offcanvas">
      <SidebarHeader className="gap-3 px-4 pt-5 pb-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-sidebar-foreground">Knox Country</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Project Zomboid · Build 42 map</p>
        </div>
        <div className="relative">
          <Input
            ref={searchRef}
            type="search"
            placeholder="Search towns, streets, POIs…"
            aria-label="Search towns, streets and points of interest"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(+1); }
              if (e.key === 'Escape') onQueryChange('');
            }}
            className="h-9 pr-9"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 text-[11px] font-mono text-muted-foreground">/</kbd>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={streetNamesOn}
          onClick={() => onToggleLayer('streetNames')}
          className={cn(
            'flex min-h-9 items-center justify-between gap-2.5 rounded-lg border border-border bg-secondary px-3 text-[13px] text-muted-foreground transition-colors hover:text-sidebar-foreground',
            streetNamesOn && 'text-sidebar-foreground',
          )}
        >
          <span>{LAYER_LABELS.streetNames}</span>
          <span className={cn('relative h-[18px] w-8 flex-none rounded-full transition-colors', streetNamesOn ? 'bg-primary' : 'bg-border')} aria-hidden="true">
            <span className={cn('absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform', streetNamesOn && 'translate-x-3.5')} />
          </span>
        </button>
      </SidebarHeader>

      <SidebarContent>
        {selected && (
          <SidebarGroup>
            <section className="rounded-lg border border-border bg-card p-3.5 shadow-sm" aria-label={`Details for ${selected.name}`}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: CATEGORIES[selected.cat].color }} aria-hidden="true" />
                <h2 className="flex-1 text-sm font-semibold tracking-tight">{selected.name}</h2>
                <button type="button" aria-label="Close details" onClick={onClearSelection} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-sidebar-foreground">✕</button>
              </div>
              <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
                {CATEGORIES[selected.cat].label}
                {selected.town ? ` · ${selected.town}` : ''}
                {' · '}
                {selected.x} x {selected.y}
                {selected.approx ? ' (approx.)' : ''}
              </p>
              {selected.desc && <p className="mt-2 text-[13px] text-sidebar-foreground text-pretty">{selected.desc}</p>}
              <div className="mt-3">
                <button type="button" aria-live="polite" onClick={() => copyCoords(selected)} className="inline-flex h-8 min-w-[104px] items-center justify-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90 active:scale-[0.98]">
                  {copied ? 'Copied!' : 'Copy coords'}
                </button>
              </div>
            </section>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <h2 className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{showingSearch ? 'Results' : 'Towns'}</h2>
          <div aria-live="polite" className="sr-only">
            {showingSearch ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}
          </div>
          <SidebarGroupContent
            ref={listRef}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(+1); }
              if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
            }}
          >
            <SidebarMenu>
              {list.map((loc) => (
                <SidebarMenuItem key={loc.id}>
                  <SidebarMenuButton asChild isActive={selected?.id === loc.id} className="result h-auto py-1.5">
                    <button type="button" aria-label={`${loc.name}${loc.town ? `, ${loc.town}` : ''}`} onClick={() => onSelect(loc)}>
                      <span className="h-2 w-2 flex-none rounded-full" style={{ background: CATEGORIES[loc.cat].color }} aria-hidden="true" />
                      <span className="flex-1 truncate text-sm">{loc.name}</span>
                      <span className="flex-none text-xs text-muted-foreground">{loc.town ?? CATEGORIES[loc.cat].label}</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {showingSearch && results.length === 0 && (
                <li className="px-2.5 py-2 text-[13px] text-muted-foreground text-pretty">Nothing matches "{query}". Try a town or POI name.</li>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-4 py-3.5 text-xs text-muted-foreground">
        <p className="text-pretty">
          Map, streets and isometric tiles are all rendered from the B42 game files.
          Town positions from <a href="https://pzwiki.net" target="_blank" rel="noreferrer" className="underline decoration-border hover:text-sidebar-foreground">PZwiki</a>;
          POI spots are approximate. Unofficial fan project.
        </p>
      </SidebarFooter>
    </SidebarRoot>
  );
}
