export const LIVE_PROTOCOL_VERSION = 1;

export interface LivePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  facing?: number;
  // The player's B42 faction name, if any — used to scope whole-server
  // visibility so rival factions don't see each other by default.
  group?: string;
  updatedAt: number;
}

export interface LivePayload {
  v: number;
  players: LivePlayer[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parsePlayer(raw: unknown): LivePlayer | null {
  if (!isRecord(raw)) return null;
  const { id, name, x, y, z, updatedAt, facing, group } = raw;
  if (typeof id !== 'string') return null;
  if (typeof name !== 'string') return null;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
  if (typeof updatedAt !== 'number') return null;
  const player: LivePlayer = { id, name, x, y, z, updatedAt };
  if (typeof facing === 'number') player.facing = facing;
  if (typeof group === 'string') player.group = group;
  return player;
}

export function parseLivePayload(raw: unknown): LivePayload | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== LIVE_PROTOCOL_VERSION) return null;
  if (!Array.isArray(raw.players)) return null;
  const players: LivePlayer[] = [];
  for (const entry of raw.players) {
    const parsed = parsePlayer(entry);
    if (parsed) players.push(parsed);
  }
  return { v: raw.v, players };
}
