// Mirrors src/live/protocol.ts in the pzmap web app. Kept as a separate copy
// because this Worker and the Vite app are independently deployable units —
// see docs/plans/2026-08-08-pzmap-live-2-relay.md, Global Constraints.
// Keep the `v` field and shape in sync by hand.

export const LIVE_PROTOCOL_VERSION = 1;

export interface LivePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  facing?: number;
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
  const { id, name, x, y, z, updatedAt, facing } = raw;
  if (typeof id !== 'string') return null;
  if (typeof name !== 'string') return null;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
  if (typeof updatedAt !== 'number') return null;
  const player: LivePlayer = { id, name, x, y, z, updatedAt };
  if (typeof facing === 'number') player.facing = facing;
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
