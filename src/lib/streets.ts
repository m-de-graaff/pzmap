import { TOWNS } from '../data/locations';
import type { Location } from '../data/locations';
import type { MapData } from '../map/vectorLayer';

function nearestTown(x: number, y: number): string {
  let best = TOWNS[0];
  let bestD = Infinity;
  for (const t of TOWNS) {
    const d = (t.x - x) ** 2 + (t.y - y) ** 2;
    if (d < bestD) { bestD = d; best = t; }
  }
  return best.name;
}

/**
 * Turn the game's street segments into searchable locations, merging
 * segments that share a name and belong to the same town.
 */
export function buildStreetLocations(data: MapData): Location[] {
  const groups = new Map<string, Location>();
  for (const s of data.streets) {
    const mid = Math.floor(s.p.length / 4) * 2;
    const x = s.p[mid];
    const y = s.p[mid + 1];
    const town = nearestTown(x, y);
    const key = `${s.n}|${town}`;
    const existing = groups.get(key);
    if (existing) {
      existing.pts!.push(s.p);
    } else {
      groups.set(key, {
        id: `st-${groups.size}`,
        name: s.n,
        cat: 'street',
        x,
        y,
        town,
        pts: [s.p],
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
