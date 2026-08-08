import type { Location } from '../data/locations';

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Higher is better; 0 means no match. */
export function scoreMatch(query: string, loc: Location): number {
  const q = norm(query.trim());
  if (!q) return 0;
  const candidates = [loc.name, ...(loc.aliases ?? []), loc.town ?? ''].filter(Boolean);
  let best = 0;
  for (const c of candidates) {
    const t = norm(c);
    let s = 0;
    if (t === q) s = 120;
    else if (t.startsWith(q)) s = 100 - Math.min(20, t.length - q.length);
    else if (t.split(/[\s(),-]+/).some((w) => w.startsWith(q))) s = 80;
    else if (t.includes(q)) s = 60;
    if (s > best) best = s;
  }
  return best;
}

export function searchLocations(query: string, locations: Location[], limit = 25): Location[] {
  return locations
    .map((loc) => ({ loc, s: scoreMatch(query, loc) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.loc.name.localeCompare(b.loc.name))
    .slice(0, limit)
    .map((r) => r.loc);
}
