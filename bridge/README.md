# pzmap-bridge

Publishes a server's `pzmap-live-server.json` (written by the pzmap Live mod's server half)
into a relay room, so anyone with the room link sees the whole server live on pzmap without
installing the mod themselves.

## Setup

    npm install
    npm run build

## Run

    node bin/pzmap-bridge.mjs \
      --file /path/to/Zomboid/Lua/pzmap-live-server.json \
      --relay wss://<your-relay> \
      --room <the room code from the pzmap sidebar> \
      --interval-ms 1000   # optional, defaults to 1000

Get the room code by starting a room in pzmap's sidebar (or asking whoever manages the map to
share theirs) — the bridge joins an existing room, it doesn't create one.

Not yet published to npm, so `npx pzmap-bridge` doesn't work yet — run it from a clone of this
repo as shown above until someone publishes it under that name.
