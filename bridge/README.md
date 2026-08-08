# pzmap-bridge

Publishes a server's `pzmap-live-server.json` (written by the pzmap Live mod's server half)
into a relay room, so anyone with the room link sees the whole server live on pzmap without
installing the mod themselves.

## Get a room code

Open pzmap yourself, click "Share my location" (or, if you'd rather not share your own
character, ask any player already sharing for their link) and copy the `room=` code out of
the URL. The bridge joins that existing room — it doesn't create one.

## Run it (no Node.js, no npm)

Download `pzmap-bridge.exe` (built from `sea/`, see below) and run:

    pzmap-bridge.exe --file "C:\path\to\Zomboid\Lua\pzmap-live-server.json" --relay wss://<your-relay> --room <code>

That's the entire setup — one file, no install step. `--interval-ms` is optional (defaults to
1000). Add it to your server's existing start script if you want it to launch automatically:

    pzmap-bridge.exe --file ... --relay ... --room ... &
    ./start-server.sh

It's unsigned, so Windows may show a SmartScreen prompt the first time — "More info" → "Run
anyway".

## Building the .exe (only needed if you're changing this code)

    npm install
    npm run build:exe

Produces `sea/pzmap-bridge.exe` via Node's Single Executable Application feature — see
`sea/build.mjs`. Windows-only as written; building for Linux/macOS needs the same recipe run
natively on that OS (SEA binaries aren't cross-platform).

## Running from source (also only needed if you're changing this code)

    npm install
    npm run build
    node bin/pzmap-bridge.mjs --file ... --relay ... --room ...
