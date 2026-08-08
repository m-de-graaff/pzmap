# pzmap-bridge

Publishes a server's `pzmap-live-server.json` (written by the pzmap Live mod's server half)
into a relay room, so anyone with the room link sees the whole server live on pzmap without
installing the mod themselves.

## Do you even need this?

Only if pzmap can't reach the server's files directly. If you're hosting on your **own PC**
(the same machine, or one on your LAN with a mapped drive), skip the bridge entirely: open
pzmap in a browser on that machine, click "Share my location", and pick
`Zomboid/Lua/pzmap-live-server.json` instead of the single-player file — it already has
everyone's position, and the browser doesn't care how many players are in a payload. The
bridge exists specifically for servers on a VPS, Pelican, Pterodactyl, or anywhere else you
don't have a browser with local file access to the server's storage.

## Scope who can see what — factions

**By default, running this exposes every online player to whoever holds the room link.** On
a server with rival factions, that's a real fairness problem — it tells one group exactly
where the other is. The mod tags each player's position with their in-game faction (B42's
built-in faction system), and `--group <faction name>` filters to just that faction before
anything is even sent to the relay — rival factions' positions never leave the server.

Run one bridge instance per faction you want to expose, each with its own private link:

    pzmap-bridge --file ... --relay ... --group Outlaws --room-name outlaws --room-password <a-secret-only-outlaws-gets>
    pzmap-bridge --file ... --relay ... --group Raiders --room-name raiders --room-password <a-different-secret>

`--room-name`/`--room-password` (instead of a raw `--room <code>`) let you pick something
memorable — the actual room used on the relay is derived from *both* together, so knowing a
faction's name (which isn't secret — other players can see factions exist) isn't enough to
guess its room; you also need the password. Each bridge prints the resulting link on startup:

    Room code: k9bqbrk6 — share "<your pzmap URL>#room=k9bqbrk6" with whoever should see this.

Give each faction only their own link. Running without `--group` prints a loud warning for
exactly this reason — it's for cases where showing everyone is actually what you want (e.g. an
admin-only moderation view you never share with players).

If your server doesn't use factions at all, just omit `--group` and use a single `--room <code>`
or `--room-name`/`--room-password` — same fairness caveat applies, since everyone shares one
view.

**Password hygiene:** `--room-password` on the command line ends up in that plaintext wherever
the launch command itself is stored or visible (a panel's saved startup command, `ps`/`/proc`
on the host, shell history) — anyone who can read it gets the same access as anyone in the
faction, no relay access needed. Set `PZMAP_BRIDGE_ROOM_PASSWORD` as an environment variable
instead wherever you can (most panels, including Pelican/Pterodactyl, let you set per-server
env vars separately from the visible startup command) — the bridge reads it automatically, no
flag needed. Also actually make it a real password: this scheme's whole security rests on it
being hard to guess, and the relay currently has no throttle on join attempts beyond a modest
per-IP rate limit, so a short or common password is guessable given enough time.

## Run it — Windows (no Node.js, no npm)

Download `pzmap-bridge.exe` and run:

    pzmap-bridge.exe --file "C:\path\to\Zomboid\Lua\pzmap-live-server.json" --relay wss://<your-relay> --group Outlaws --room-name outlaws --room-password <secret>

One file, no install step. It's unsigned, so Windows may show a SmartScreen prompt the first
time — "More info" → "Run anyway". `--interval-ms` is optional (defaults to 1000).

## Run it — Linux (no Node.js, no npm)

Same idea, download `pzmap-bridge-linux-x64`:

    chmod +x pzmap-bridge-linux-x64
    ./pzmap-bridge-linux-x64 --file /path/to/Zomboid/Lua/pzmap-live-server.json --relay wss://<your-relay> --group Outlaws --room-name outlaws --room-password <secret>

`chmod +x` is the one extra step Linux needs — the file itself is still a single self-contained
binary.

**Keep it running with your server**, e.g. in a systemd service or your server's start script,
by backgrounding it before the real launch command (one line per faction you're exposing):

    ./pzmap-bridge-linux-x64 --file ./Zomboid/Lua/pzmap-live-server.json --relay wss://<your-relay> --group Outlaws --room-name outlaws --room-password <secret> &
    ./pzmap-bridge-linux-x64 --file ./Zomboid/Lua/pzmap-live-server.json --relay wss://<your-relay> --group Raiders --room-name raiders --room-password <secret2> &
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
3. If your panel has a per-server **environment variables** section (Pelican and Pterodactyl
   both do, usually as egg-defined variables), set `PZMAP_BRIDGE_ROOM_PASSWORD` there instead
   of putting `--room-password` in the startup command — the startup command is typically
   visible to more people (co-admins, support staff, anyone with panel read access) than a
   dedicated env var field, and it's what ends up in the panel's saved config either way.
4. Edit the server's **startup command** (in the panel's server settings) to background the
   bridge first, then run the original command unchanged:

   ```
   /home/container/pzmap-bridge-linux-x64 --file /home/container/.cache/Lua/pzmap-live-server.json --relay wss://<your-relay> --group Outlaws --room-name outlaws & export PATH="./jre64/bin:$PATH" ; export LD_LIBRARY_PATH="./linux64:./natives:.:./jre64/lib/amd64:${LD_LIBRARY_PATH}" ; JSIG="libjsig.so" ; LD_PRELOAD="${LD_PRELOAD}:${JSIG}" ./ProjectZomboid64 -port {{SERVER_PORT}} -udpport {{STEAM_PORT}} -cachedir=/home/container/.cache -servername "{{SERVER_NAME}}" -adminusername {{ADMIN_USER}} -adminpassword "{{ADMIN_PASSWORD}}"
   ```

   Only the very front changed — `/home/container/pzmap-bridge-linux-x64 ... &` was added
   before the rest, unchanged, and `--room-password` is gone since step 3's env var supplies
   it instead. The `&` is what makes it a background job instead of replacing the game server
   as the main process. Add another `... &` line per faction if you're exposing more than one
   — each needs its own `PZMAP_BRIDGE_ROOM_PASSWORD`, so if your panel only gives you one env
   var slot per server, fall back to `--room-password` on the command line for the extra ones
   (same exposure caveat as above) or use plain `--room <code>` for those instead.

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
    node bin/pzmap-bridge.mjs --file ... --relay ... --group ... --room-name ... --room-password ...
