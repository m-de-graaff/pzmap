import { describe, expect, it } from 'vitest';
import { readRoomCode, writeRoomCode } from './roomHash';

describe('readRoomCode', () => {
  it('reads a room param alongside others', () => {
    expect(readRoomCode('#x=100&y=200&z=-3&room=ab234567')).toBe('ab234567');
  });

  it('reads a room param on its own', () => {
    expect(readRoomCode('#room=ab234567')).toBe('ab234567');
  });

  it('returns null when there is no room param', () => {
    expect(readRoomCode('#x=100&y=200&z=-3')).toBeNull();
    expect(readRoomCode('')).toBeNull();
  });
});

describe('writeRoomCode', () => {
  it('adds a room param to an existing hash without disturbing other params', () => {
    expect(writeRoomCode('#x=100&y=200&z=-3', 'ab234567')).toBe('x=100&y=200&z=-3&room=ab234567');
  });

  it('replaces an existing room param in place', () => {
    expect(writeRoomCode('#x=100&room=oldcode1&y=200', 'newcode1')).toBe('x=100&room=newcode1&y=200');
  });

  it('removes the room param when code is null', () => {
    expect(writeRoomCode('#x=100&room=ab234567&y=200', null)).toBe('x=100&y=200');
  });

  it('produces just the room param when the hash was empty', () => {
    expect(writeRoomCode('', 'ab234567')).toBe('room=ab234567');
    expect(writeRoomCode('#', 'ab234567')).toBe('room=ab234567');
  });

  it('produces an empty string when removing the only param', () => {
    expect(writeRoomCode('#room=ab234567', null)).toBe('');
  });
});
