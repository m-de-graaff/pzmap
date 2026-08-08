// Throwaway local check: proves the compiled sea/pzmap-bridge.exe works
// exactly like `node bin/pzmap-bridge.mjs` — same harness as
// ../scripts/check-bridge.mjs, pointed at the standalone binary.
// Run relay's `npx wrangler dev --port 8787` first.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCheck } from '../scripts/checkHarness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXE = join(__dirname, 'pzmap-bridge.exe');

await runCheck({
  room: 'exebrdg2',
  playerName: 'ExeTestPlayer',
  command: EXE,
  args: [],
});
