// Throwaway local check: run the relay locally (cd relay && npx wrangler
// dev --port 8787) in one terminal, then `node scripts/check-bridge.mjs`
// in another (from bridge/). See checkHarness.mjs for what this verifies.

import { runCheck } from './checkHarness.mjs';

await runCheck({
  room: 'brdgchk2',
  playerName: 'ServerPlayer',
  command: 'node',
  args: ['bin/pzmap-bridge.mjs'],
});
