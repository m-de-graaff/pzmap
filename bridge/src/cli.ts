import { readFile as fsReadFile } from 'node:fs/promises';
import { startFileWatching } from './fileWatcher.js';
import { connectToRoom } from './relayPublisher.js';

interface CliArgs {
  file: string;
  relay: string;
  room: string;
  intervalMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const file = get('--file');
  const relay = get('--relay');
  const room = get('--room');
  if (!file || !relay || !room) {
    throw new Error('Usage: pzmap-bridge --file <path> --relay <ws-url> --room <code> [--interval-ms 1000]');
  }

  return { file, relay, room, intervalMs: Number(get('--interval-ms') ?? 1000) };
}

export function main(argv: string[]) {
  const args = parseArgs(argv);
  console.log(`pzmap-bridge: watching ${args.file}, publishing to ${args.relay}/room/${args.room}`);

  const conn = connectToRoom(args.relay, args.room, {
    onStatus: (status, message) => console.log(`[relay] ${status}${message ? `: ${message}` : ''}`),
    onState: (publishers) => console.log(`[relay] ${publishers.length} publisher(s) in room`),
  });

  startFileWatching(() => fsReadFile(args.file, 'utf8'), args.intervalMs, {
    onPayload: (payload) => {
      console.log(`[file] publishing ${payload.players.length} player(s)`);
      conn.publish(payload);
    },
    onStatus: (status, message) => {
      if (status === 'error') console.error(`[file] ${message}`);
    },
  });

  const shutdown = () => {
    conn.close();
    process.exit(0);
  };
  // SIGINT: Ctrl+C. SIGTERM: the default signal from systemd, Docker, and
  // most process managers — without handling it, a managed stop skips the
  // graceful WebSocket close entirely.
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
