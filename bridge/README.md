# pzmap-bridge

Publishes a server's `pzmap-live-server.json` (written by the pzmap Live mod's server half)
into a relay room, so anyone with the room link sees the whole server live on pzmap without
installing the mod themselves.

## Get a room code

Open pzmap yourself, click "Share my location" (or, if you'd rather not share your own
character, ask any player already sharing for their link) and copy the `room=` code out of
the URL. The bridge joins that existing room — it doesn't create one.

## Run it — Windows (no Node.js, no npm)

Download `pzmap-bridge.exe` and run:

    pzmap-bridge.exe --file "C:\path\to\Zomboid\Lua\pzmap-live-server.json" --relay wss://<your-relay> --room <code>

One file, no install step. It's unsigned, so Windows may show a SmartScreen prompt the first
time — "More info" → "Run anyway". `--interval-ms` is optional (defaults to 1000).

## Run it — Linux (no Node.js, no npm)

Same idea, download `pzmap-bridge-linux-x64`:

    chmod +x pzmap-bridge-linux-x64
    ./pzmap-bridge-linux-x64 --file /path/to/Zomboid/Lua/pzmap-live-server.json --relay wss://<your-relay> --room <code>

`chmod +x` is the one extra step Linux needs — the file itself is still a single self-contained
binary.

**Keep it running with your server**, e.g. in a systemd service or your server's start script,
by backgrounding it before the real launch command:

    ./pzmap-bridge-linux-x64 --file ./Zomboid/Lua/pzmap-live-server.json --relay wss://<your-relay> --room <code> &
    ./start-project-zomboid.sh

## Run it — Pelican / Pterodactyl (or any panel with one startup command)

These panels only support a single startup command per server (no built-in way to run two
processes side by side), so the trick is to background the bridge inside that one command
before the real one. Using the official [pelican-eggs Project Zomboid
egg](https://github.com/pelican-eggs/eggs/blob/master/game_eggs/steamcmd_servers/project_zomboid/egg-project-zomboid.json)
as an example — its startup command is:

    export PATH="./jre64/bin:$PATH" ; export LD_LIBRARY_PATH="./linux64:./natives:.:./jre64/lib/amd64:${LD_LIBRARY_PATH}" ; JSIG="libjsig.so" ; LD_PRELOAD="${LD_PRELOAD}:${JSIG}" ./ProjectZomboid64 -port {{SERVER_PORT}} -udpport {{STEAM_PORT}} -cachedir=/home/container/.cache -servername "{{SERVER_NAME}}" -adminusername {{ADMIN_USER}} -adminpassword "{{ADMIN_PASSWORD}}"

That egg's `-cachedir=/home/container/.cache` flag means your live-data file lands at
`/home/container/.cache/Lua/pzmap-live-server.json` — check yours the same way (look for
`-cachedir` in your egg's startup command, or just browse the file manager after the mod's
been running a minute).

1. Upload `pzmap-bridge-linux-x64` to `/home/container/` via the panel's file manager or SFTP.
2. Make it executable. If the file manager has a permissions/chmod option, use that; otherwise
   an SFTP client with chmod support (e.g. FileZilla: right-click → File permissions) works.
3. Edit the server's **startup command** (in the panel's server settings) to background the
   bridge first, then run the original command unchanged:

   ```
   /home/container/pzmap-bridge-linux-x64 --file /home/container/.cache/Lua/pzmap-live-server.json --relay wss://<your-relay> --room <code> & export PATH="./jre64/bin:$PATH" ; export LD_LIBRARY_PATH="./linux64:./natives:.:./jre64/lib/amd64:${LD_LIBRARY_PATH}" ; JSIG="libjsig.so" ; LD_PRELOAD="${LD_PRELOAD}:${JSIG}" ./ProjectZomboid64 -port {{SERVER_PORT}} -udpport {{STEAM_PORT}} -cachedir=/home/container/.cache -servername "{{SERVER_NAME}}" -adminusername {{ADMIN_USER}} -adminpassword "{{ADMIN_PASSWORD}}"
   ```

   Only the very front changed — `/home/container/pzmap-bridge-linux-x64 ... &` was added
   before the rest, unchanged. The `&` is what makes it a background job instead of replacing
   the game server as the main process.

The same technique — background the bridge, then the real command — works for any panel or
custom launch script, not just this specific egg; adjust the file path and the rest of the
command to match yours.

## Building the executables (only needed if you're changing this code)

    npm install
    npm run build:exe          # this machine's platform → sea/pzmap-bridge.exe (Windows) or sea/pzmap-bridge (Linux/macOS, if run there)
    npm run build:exe:linux    # cross-builds sea/pzmap-bridge-linux-x64 from any OS

The Linux cross-build downloads the official Node.js release matching this machine's own Node
version, verifies its SHA-256 against nodejs.org's published checksums, and injects into that
— see `sea/build.mjs`. It doesn't require a Linux machine to build, but it also can't be
execution-tested outside one; only the binary's structure (ELF header, size) is checked here.

## Running from source (also only needed if you're changing this code)

    npm install
    npm run build
    node bin/pzmap-bridge.mjs --file ... --relay ... --room ...
