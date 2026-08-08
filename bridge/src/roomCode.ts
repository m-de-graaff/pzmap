// Derives a room code from a human-chosen name + password instead of the
// random one src/live/relayClient.ts's generateRoomCode() produces. Lets a
// server admin set up a memorable, reproducible faction room without ever
// needing the browser: the relay only ever sees the derived code, which is
// exactly as unguessable as a random one as long as the password is kept
// secret — knowing the (public, guessable) faction name alone isn't enough.

import { createHash } from 'node:crypto';

// Mirrors relay/src/roomLogic.ts's ROOM_CODE_ALPHABET — duplicated for the
// same reason the protocol is: independently deployable units.
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function deriveRoomCode(name: string, password: string): string {
  const hash = createHash('sha256').update(`${name}:${password}`).digest();
  return Array.from(hash.subarray(0, 8), (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}
