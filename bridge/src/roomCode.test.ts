import { describe, expect, it } from 'vitest';
import { deriveRoomCode } from './roomCode.js';

const VALID_CODE_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

describe('deriveRoomCode', () => {
  it('produces a code matching the relay\'s room code format', () => {
    expect(deriveRoomCode('Outlaws', 'secret')).toMatch(VALID_CODE_RE);
  });

  it('is deterministic for the same name and password', () => {
    expect(deriveRoomCode('Outlaws', 'secret')).toBe(deriveRoomCode('Outlaws', 'secret'));
  });

  it('produces a different code for a different name', () => {
    expect(deriveRoomCode('Outlaws', 'secret')).not.toBe(deriveRoomCode('Raiders', 'secret'));
  });

  it('produces a different code for a different password', () => {
    expect(deriveRoomCode('Outlaws', 'secret')).not.toBe(deriveRoomCode('Outlaws', 'different'));
  });

  it('is not derivable from the name alone — a guessed name with the wrong password differs', () => {
    // The whole point: knowing a faction's public name isn't enough to join
    // its room without also knowing the password.
    const real = deriveRoomCode('Outlaws', 'the-real-secret');
    const guessed = deriveRoomCode('Outlaws', '');
    expect(real).not.toBe(guessed);
  });
});
