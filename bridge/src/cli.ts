import { readFile as fsReadFile } from 'node:fs/promises';
import { startFileWatching } from './fileWatcher.js';
import { connectToRoom } from './relayPublisher.js';
import { filterByGroup } from './groupFilter.js';
import { deriveRoomCode } from './roomCode.js';

const USAGE = 'Usage: pzmap-bridge --file <path> --relay <ws-url> (--room <code> | --room-name <name> --room-password <password>) [--group <faction>] [--interval-ms 1000]';

interface CliArgs {
  file: string;
  relay: string;
  room: string;
  group: string | null;
  intervalMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const file = get('--file');
  const relay = get('--relay');
  if (!file || !relay) throw new Error(USAGE);

  const roomFlag = get('--room');
  const roomName = get('--room-name');
  const roomPassword = get('--room-password');

  let room: string;
  if (roomFlag) {
    if (roomName || roomPassword) {
      throw new Error('Use either --room, or --room-name/--room-password, not both.');
    }
    room = roomFlag;
  } else if (roomName && roomPassword) {
    room = deriveRoomCode(roomName, roomPassword);
  } else {
    throw new Error(USAGE);
  }

  return {
    file,
    relay,
    room,
    group: get('--group') ?? null,
    intervalMs: Number(get('--interval-ms') ?? 1000),
  };
}

export function main(argv: string[]) {
  const args = parseArgs(argv);

  if (!args.group) {
    console.warn('\n⚠ No --group set: this publishes EVERY online player.');
    console.warn('  Anyone with this room link sees the whole server, including rival factions.');
    console.warn('  Pass --group <faction name> to scope this to one faction.\n');
  }

  console.log(`pzmap-bridge: watching ${args.file}${args.group ? ` (group: ${args.group})` : ''}`);
  console.log(`Room code: ${args.room} — share "<your pzmap URL>#room=${args.room}" with whoever should see this.`);

  const conn = connectToRoom(args.relay, args.room, {
    onStatus: (status, message) => console.log(`[relay] ${status}${message ? `: ${message}` : ''}`),
    onState: (publishers) => console.log(`[relay] ${publishers.length} publisher(s) in room`),
  });

  startFileWatching(() => fsReadFile(args.file, 'utf8'), args.intervalMs, {
    onPayload: (payload) => {
      const filtered = filterByGroup(payload, args.group);
      const suffix = args.group ? ` of ${payload.players.length} total` : '';
      console.log(`[file] publishing ${filtered.players.length} player(s)${suffix}`);
      conn.publish(filtered);
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
