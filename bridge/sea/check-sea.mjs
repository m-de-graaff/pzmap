// Throwaway local check: proves the compiled sea/pzmap-bridge.exe works
// exactly like `node bin/pzmap-bridge.mjs` — same real-relay integration
// check as scripts/check-bridge.mjs, pointed at the standalone binary.
// Run relay's `npx wrangler dev --port 8787` first.

import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXE = join(__dirname, 'pzmap-bridge.exe');
const ROOM = 'exebrdg2';
const RELAY = 'ws://localhost:8787';

const dir = await mkdtemp(join(tmpdir(), 'pzmap-bridge-sea-check-'));
const file = join(dir, 'pzmap-live-server.json');
await writeFile(file, JSON.stringify({
  v: 1,
  players: [{ id: '1', name: 'ExeTestPlayer', x: 100, y: 200, z: 0, updatedAt: Date.now() }],
}));

const watcher = new WebSocket(`${RELAY}/room/${ROOM}`);
const waitForSeen = new Promise((resolve, reject) => {
  const seenStates = [];
  watcher.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      seenStates.push(msg);
      if (msg.publishers.some((p) => p.payload.players[0]?.name === 'ExeTestPlayer')) {
        resolve(seenStates);
      }
    }
  });
  watcher.addEventListener('error', reject);
  setTimeout(() => resolve(seenStates), 5000);
});

const bridge = spawn(EXE, ['--file', file, '--relay', RELAY, '--room', ROOM, '--interval-ms', '500'], {
  stdio: 'inherit',
});

const seen = await waitForSeen;

bridge.kill();
watcher.close();
await rm(dir, { recursive: true, force: true });

const ok = seen.some((s) => s.publishers.some((p) => p.payload.players[0]?.name === 'ExeTestPlayer'));
console.log(ok ? 'PASS' : 'FAIL: watcher never saw the compiled exe\'s published payload');
process.exit(ok ? 0 : 1);
