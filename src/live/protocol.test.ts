import { describe, expect, it } from 'vitest';
import { parseLivePayload, LIVE_PROTOCOL_VERSION } from './protocol';

const validPlayer = { id: '1', name: 'Kate', x: 100, y: 200, z: 0, updatedAt: 1000 };

describe('parseLivePayload', () => {
  it('accepts a well-formed payload', () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [validPlayer] };
    expect(parseLivePayload(payload)).toEqual(payload);
  });

  it('keeps a numeric facing field', () => {
    const payload = { v: 1, players: [{ ...validPlayer, facing: 90.5 }] };
    expect(parseLivePayload(payload)?.players[0].facing).toBe(90.5);
  });

  it('drops a non-numeric facing field instead of rejecting the player', () => {
    const payload = { v: 1, players: [{ ...validPlayer, facing: 'north' }] };
    const result = parseLivePayload(payload);
    expect(result?.players).toHaveLength(1);
    expect(result?.players[0].facing).toBeUndefined();
  });

  it('keeps a string group field', () => {
    const payload = { v: 1, players: [{ ...validPlayer, group: 'Outlaws' }] };
    expect(parseLivePayload(payload)?.players[0].group).toBe('Outlaws');
  });

  it('drops a non-string group field instead of rejecting the player', () => {
    const payload = { v: 1, players: [{ ...validPlayer, group: 42 }] };
    const result = parseLivePayload(payload);
    expect(result?.players).toHaveLength(1);
    expect(result?.players[0].group).toBeUndefined();
  });

  it('rejects non-object input', () => {
    expect(parseLivePayload(null)).toBeNull();
    expect(parseLivePayload('nope')).toBeNull();
    expect(parseLivePayload(42)).toBeNull();
  });

  it('rejects an unrecognized protocol version', () => {
    expect(parseLivePayload({ v: 2, players: [validPlayer] })).toBeNull();
  });

  it('rejects a payload with no players array', () => {
    expect(parseLivePayload({ v: 1 })).toBeNull();
    expect(parseLivePayload({ v: 1, players: 'nope' })).toBeNull();
  });

  it('filters out malformed player entries but keeps the good ones', () => {
    const payload = {
      v: 1,
      players: [validPlayer, { id: '2', name: 'Bad' /* missing x/y/z/updatedAt */ }],
    };
    const result = parseLivePayload(payload);
    expect(result?.players).toEqual([validPlayer]);
  });

  it('returns an empty players array when all entries are malformed', () => {
    const payload = { v: 1, players: [{ id: '2' }] };
    expect(parseLivePayload(payload)).toEqual({ v: 1, players: [] });
  });
});
