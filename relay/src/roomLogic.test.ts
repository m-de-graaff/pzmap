import { describe, expect, it } from 'vitest';
import {
  isValidRoomCode,
  shouldRateLimit,
  buildSnapshot,
  MIN_PUBLISH_INTERVAL_MS,
} from './roomLogic';
import type { PublisherState } from './roomLogic';
import { LIVE_PROTOCOL_VERSION } from './protocol';

describe('isValidRoomCode', () => {
  it('accepts an 8-char code from the room alphabet', () => {
    expect(isValidRoomCode('ab234567')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidRoomCode('abc')).toBe(false);
    expect(isValidRoomCode('ab234567890')).toBe(false);
  });

  it('rejects characters outside the alphabet (ambiguous letters, uppercase, symbols)', () => {
    expect(isValidRoomCode('ab234560')).toBe(false); // '0' excluded
    expect(isValidRoomCode('AB234567')).toBe(false); // uppercase
    expect(isValidRoomCode('ab234!67')).toBe(false); // symbol
  });
});

describe('shouldRateLimit', () => {
  it('allows the first publish (no prior state)', () => {
    expect(shouldRateLimit(undefined, 1000)).toBe(false);
  });

  it('blocks a publish inside the minimum interval', () => {
    const state: PublisherState = { connId: 'a', payload: { v: 1, players: [] }, lastPublishMs: 1000 };
    expect(shouldRateLimit(state, 1000 + MIN_PUBLISH_INTERVAL_MS - 1)).toBe(true);
  });

  it('allows a publish once the interval has passed', () => {
    const state: PublisherState = { connId: 'a', payload: { v: 1, players: [] }, lastPublishMs: 1000 };
    expect(shouldRateLimit(state, 1000 + MIN_PUBLISH_INTERVAL_MS)).toBe(false);
  });
});

describe('buildSnapshot', () => {
  it('produces a state message listing every publisher by connId', () => {
    const publishers = new Map<string, PublisherState>([
      ['a', { connId: 'a', payload: { v: LIVE_PROTOCOL_VERSION, players: [] }, lastPublishMs: 0 }],
      ['b', { connId: 'b', payload: { v: LIVE_PROTOCOL_VERSION, players: [] }, lastPublishMs: 0 }],
    ]);
    expect(buildSnapshot(publishers)).toEqual({
      type: 'state',
      publishers: [
        { connId: 'a', payload: { v: LIVE_PROTOCOL_VERSION, players: [] } },
        { connId: 'b', payload: { v: LIVE_PROTOCOL_VERSION, players: [] } },
      ],
    });
  });

  it('produces an empty list for an empty room', () => {
    expect(buildSnapshot(new Map())).toEqual({ type: 'state', publishers: [] });
  });
});
