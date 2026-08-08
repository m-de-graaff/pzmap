import type { LivePayload } from './protocol';

export const MAX_ROOM_MEMBERS = 12;
export const MAX_PAYLOAD_BYTES = 8192;
export const MIN_PUBLISH_INTERVAL_MS = 400;
export const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{8}$`);

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_RE.test(code);
}

export interface PublisherState {
  connId: string;
  payload: LivePayload;
  lastPublishMs: number;
}

export function shouldRateLimit(state: PublisherState | undefined, nowMs: number): boolean {
  if (!state) return false;
  return nowMs - state.lastPublishMs < MIN_PUBLISH_INTERVAL_MS;
}

export function buildSnapshot(publishers: Map<string, PublisherState>) {
  return {
    type: 'state' as const,
    publishers: Array.from(publishers.values()).map(({ connId, payload }) => ({ connId, payload })),
  };
}
