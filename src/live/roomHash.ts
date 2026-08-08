const ROOM_PARAM_RE = /(?:^|&)room=([^&]*)/;

function stripHash(hash: string): string {
  return hash.replace(/^#/, '');
}

export function readRoomCode(hash: string): string | null {
  const m = stripHash(hash).match(ROOM_PARAM_RE);
  return m ? m[1] : null;
}

export function writeRoomCode(hash: string, code: string | null): string {
  const body = stripHash(hash);
  const hasRoom = ROOM_PARAM_RE.test(body);
  if (hasRoom) {
    return body.replace(ROOM_PARAM_RE, (match) => {
      const prefix = match.startsWith('&') ? '&' : '';
      return code ? `${prefix}room=${code}` : '';
    });
  }
  if (!code) return body;
  return body ? `${body}&room=${code}` : `room=${code}`;
}

export function getRoomCodeFromHash(): string | null {
  return readRoomCode(window.location.hash);
}

export function setRoomCodeInHash(code: string | null): void {
  const next = writeRoomCode(window.location.hash, code);
  history.replaceState(null, '', next ? `#${next}` : window.location.pathname + window.location.search);
}
