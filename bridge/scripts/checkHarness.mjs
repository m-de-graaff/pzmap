// Shared harness for the bridge's local integration checks (check-bridge.mjs,
// sea/check-sea.mjs): writes a stand-in server payload to a temp file, spawns
// whatever bridge command is given, and confirms a third WebSocket watcher
// client in the same room receives what it published. Run relay's
// `npx wrangler dev --port 8787` first.

import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const RELAY = 'ws://localhost:8787';

export async function runCheck({ room, playerName, command, args }) {
  const dir = await mkdtemp(join(tmpdir(), 'pzmap-bridge-check-'));
  const file = join(dir, 'pzmap-live-server.json');
  await writeFile(file, JSON.stringify({
    v: 1,
    players: [{ id: '1', name: playerName, x: 100, y: 200, z: 0, updatedAt: Date.now() }],
  }));

  const watcher = new WebSocket(`${RELAY}/room/${room}`);
  const waitForSeen = new Promise((resolve, reject) => {
    const seenStates = [];
    watcher.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') {
        seenStates.push(msg);
        if (msg.publishers.some((p) => p.payload.players[0]?.name === playerName)) {
          resolve(seenStates);
        }
      }
    });
    watcher.addEventListener('error', reject);
    setTimeout(() => resolve(seenStates), 5000);
  });

  // Spawn the bridge concurrently with waiting — it must be running for the
  // watcher to ever see anything published.
  const bridge = spawn(command, [...args, '--file', file, '--relay', RELAY, '--room', room, '--interval-ms', '500'], {
    stdio: 'inherit',
  });

  const seen = await waitForSeen;

  bridge.kill('SIGINT');
  watcher.close();
  await rm(dir, { recursive: true, force: true });

  const ok = seen.some((s) => s.publishers.some((p) => p.payload.players[0]?.name === playerName));
  console.log(ok ? 'PASS' : `FAIL: watcher never saw ${playerName}'s published payload`);
  process.exit(ok ? 0 : 1);
}
