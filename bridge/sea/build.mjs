// Builds sea/pzmap-bridge.exe: a standalone executable with the bridge CLI
// baked in via Node's Single Executable Application feature. Nobody running
// the resulting file needs Node.js or npm installed — the binary *is* the
// Node runtime, plus the bridge as a bundled CJS payload.
//
// Windows-only as written (copies node.exe, injects, done). Building for
// Linux/macOS needs this same recipe run natively on that OS — Node SEA
// binaries aren't cross-platform; see bridge/README.md.
//
// Run: node sea/build.mjs   (after `npm run build` has produced dist/)

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const seaDir = dirname(fileURLToPath(import.meta.url));
const bridgeDir = dirname(seaDir);

if (!existsSync(join(bridgeDir, 'dist', 'sea-entry.js'))) {
  console.error('dist/sea-entry.js not found — run `npm run build` first.');
  process.exit(1);
}

// shell: true is required on Windows to invoke npx (a .cmd file) at all —
// safe here since every argument below is a static literal, never user input.
console.log('Bundling to a single CJS file...');
execFileSync('npx', ['esbuild', 'dist/sea-entry.js', '--bundle', '--platform=node', '--format=cjs', '--outfile=sea/bundle.cjs'], {
  cwd: bridgeDir,
  stdio: 'inherit',
  shell: true,
});

console.log('Generating the SEA blob...');
execFileSync(process.execPath, ['--experimental-sea-config', 'sea-config.json'], {
  cwd: seaDir,
  stdio: 'inherit',
});

console.log('Copying the Node binary...');
copyFileSync(process.execPath, join(seaDir, 'pzmap-bridge.exe'));

console.log('Injecting the blob (postject)...');
execFileSync('npx', [
  'postject', 'sea/pzmap-bridge.exe', 'NODE_SEA_BLOB', 'sea/sea-prep.blob',
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
], {
  cwd: bridgeDir,
  stdio: 'inherit',
  shell: true,
});

console.log('\nDone: bridge/sea/pzmap-bridge.exe');
console.log('It is unsigned — Windows SmartScreen may prompt on first run (More info -> Run anyway).');
