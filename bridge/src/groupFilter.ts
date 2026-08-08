import type { LivePayload } from './protocol.js';

export function filterByGroup(payload: LivePayload, group: string | null): LivePayload {
  if (!group) return payload;
  return { v: payload.v, players: payload.players.filter((p) => p.group === group) };
}
