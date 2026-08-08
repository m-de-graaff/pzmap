// Throwaway local check: run the relay locally (cd relay && npx wrangler
// dev --port 8787) in one terminal, then `node scripts/check-group-filter.mjs`
// in another (from bridge/, after `npm run build`). Confirms --group and
// --room-name/--room-password actually work together: a mixed-faction
// roster gets filtered to one faction, published to a room derived from a
// name+password instead of a raw --room code.

import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { deriveRoomCode } from '../dist/roomCode.js';

const RELAY = 'ws://localhost:8787';
const ROOM_NAME = 'group-filter-check';
const ROOM_PASSWORD = 'check-password-123';
const room = deriveRoomCode(ROOM_NAME, ROOM_PASSWORD);

const dir = await mkdtemp(join(tmpdir(), 'pzmap-bridge-group-check-'));
const file = join(dir, 'pzmap-live-server.json');
await writeFile(file, JSON.stringify({
  v: 1,
  players: [
    { id: '1', name: 'OutlawPlayer', x: 100, y: 200, z: 0, updatedAt: Date.now(), group: 'Outlaws' },
    { id: '2', name: 'RaiderPlayer', x: 300, y: 400, z: 0, updatedAt: Date.now(), group: 'Raiders' },
  ],
}));

const watcher = new WebSocket(`${RELAY}/room/${room}`);
const waitForSeen = new Promise((resolve, reject) => {
  const seenStates = [];
  watcher.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      seenStates.push(msg);
      if (msg.publishers.some((p) => p.payload.players.length > 0)) resolve(seenStates);
    }
  });
  watcher.addEventListener('error', reject);
  setTimeout(() => resolve(seenStates), 5000);
});

const bridge = spawn('node', [
  'bin/pzmap-bridge.mjs',
  '--file', file,
  '--relay', RELAY,
  '--room-name', ROOM_NAME,
  '--room-password', ROOM_PASSWORD,
  '--group', 'Outlaws',
  '--interval-ms', '500',
], { stdio: 'inherit' });

const seen = await waitForSeen;

bridge.kill('SIGINT');
watcher.close();
await rm(dir, { recursive: true, force: true });

const lastState = seen.at(-1);
const players = lastState?.publishers.flatMap((p) => p.payload.players) ?? [];
const gotOutlaw = players.some((p) => p.name === 'OutlawPlayer');
const leakedRaider = players.some((p) => p.name === 'RaiderPlayer');

console.log('players seen in the room:', players.map((p) => `${p.name} (${p.group})`));

const ok = gotOutlaw && !leakedRaider;
console.log(ok ? 'PASS' : `FAIL: gotOutlaw=${gotOutlaw} leakedRaider=${leakedRaider}`);
process.exit(ok ? 0 : 1);
