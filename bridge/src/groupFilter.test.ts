import { describe, expect, it } from 'vitest';
import { filterByGroup } from './groupFilter.js';
import { LIVE_PROTOCOL_VERSION } from './protocol.js';

const outlaw = { id: '1', name: 'Kate', x: 0, y: 0, z: 0, updatedAt: 0, group: 'Outlaws' };
const raider = { id: '2', name: 'Zed', x: 0, y: 0, z: 0, updatedAt: 0, group: 'Raiders' };
const loner = { id: '3', name: 'Rick', x: 0, y: 0, z: 0, updatedAt: 0 };

describe('filterByGroup', () => {
  it('passes the payload through unchanged when group is null', () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [outlaw, raider, loner] };
    expect(filterByGroup(payload, null)).toEqual(payload);
  });

  it('keeps only players in the given group', () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [outlaw, raider, loner] };
    expect(filterByGroup(payload, 'Outlaws').players).toEqual([outlaw]);
  });

  it('excludes players with no group at all when a group is set', () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [loner] };
    expect(filterByGroup(payload, 'Outlaws').players).toEqual([]);
  });

  it('is case-sensitive', () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [outlaw] };
    expect(filterByGroup(payload, 'outlaws').players).toEqual([]);
  });

  it('preserves the protocol version', () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [outlaw] };
    expect(filterByGroup(payload, 'Outlaws').v).toBe(LIVE_PROTOCOL_VERSION);
  });
});
