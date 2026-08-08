// Throwaway local check: run the relay locally (cd relay && npx wrangler
// dev --port 8787) in one terminal, then `node scripts/check-bridge.mjs`
// in another (from bridge/). Writes a stand-in server payload to a temp
// file, runs the bridge CLI against it, and confirms a third WebSocket
// client in the same room receives what the bridge published.

import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const ROOM = 'brdgchk2';
const RELAY = 'ws://localhost:8787';

const dir = await mkdtemp(join(tmpdir(), 'pzmap-bridge-check-'));
const file = join(dir, 'pzmap-live-server.json');
await writeFile(file, JSON.stringify({
  v: 1,
  players: [{ id: '1', name: 'ServerPlayer', x: 100, y: 200, z: 0, updatedAt: Date.now() }],
}));

const watcher = new WebSocket(`${RELAY}/room/${ROOM}`);
const waitForSeen = new Promise((resolve, reject) => {
  const seenStates = [];
  watcher.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      seenStates.push(msg);
      if (msg.publishers.some((p) => p.payload.players[0]?.name === 'ServerPlayer')) {
        resolve(seenStates);
      }
    }
  });
  watcher.addEventListener('error', reject);
  setTimeout(() => resolve(seenStates), 5000);
});

// Spawn the bridge concurrently with waiting — it must be running for the
// watcher to ever see anything published.
const bridge = spawn('node', ['bin/pzmap-bridge.mjs', '--file', file, '--relay', RELAY, '--room', ROOM, '--interval-ms', '500'], {
  stdio: 'inherit',
});

const seen = await waitForSeen;

bridge.kill('SIGINT');
watcher.close();
await rm(dir, { recursive: true, force: true });

const ok = seen.some((s) => s.publishers.some((p) => p.payload.players[0]?.name === 'ServerPlayer'));
console.log(ok ? 'PASS' : 'FAIL: watcher never saw the bridge-published payload');
process.exit(ok ? 0 : 1);
