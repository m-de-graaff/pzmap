# Publishing pzmap Live to the Steam Workshop

This mod isn't uploaded yet — the steps below are for whoever does that (Steam Workshop
uploads happen through the in-game mod tools, using the uploader's own Steam account; nothing
in this repo can do it on your behalf).

## Before uploading

1. Add `poster.png` (512×512, PNG) and `icon.png` (128×128, PNG) to `mod/pzmapLive/common/`,
   and reference them in `mod.info`:
   ```
   poster=poster.png
   icon=icon.png
   ```
2. Confirm `mod/pzmapLive/42/media/lua/client/PzmapLiveClient.lua` and
   `mod/pzmapLive/42/media/lua/server/PzmapLiveServer.lua` have both been verified in-game (see
   the "not yet verified" notes in their commit messages) — a broken client-side script fails
   silently and nobody sees an error, so this is worth doing before a public upload, not after.

## Uploading

1. In Project Zomboid, enable Steam Workshop mod uploading in the game's mod tools (see the
   official Indie Stone modding guide for the current menu path — it moves between builds).
2. Point the uploader at `mod/pzmapLive/` (the folder containing `common/` and `42/`).
3. Paste the description below into the Workshop item's description field.
4. Publish, then copy the resulting Workshop URL into this repo's `README.md` "Live location"
   section so players can find it from the map itself.

## Workshop description (paste as-is)

pzmap Live streams your character's position to a file pzmap (https://pzmap.vercel.app) can
read and draw on the map, live, while you play.

**Solo**: install this mod, open pzmap, click "Share my location" in the sidebar, and pick your
`Zomboid/Lua/pzmap-live.json` file once. No server, no account — everything stays on your
machine and in your browser tab.

**Friends**: click "Start a room" in pzmap after sharing your location, and send the link.
Anyone who opens it sees your marker live, without installing anything themselves.

**Whole server**: server admins can enable this mod's server half and run the companion
`pzmap-bridge` tool to put every connected player on the map for anyone with the room link —
see the pzmap repo README for setup.

Unofficial fan project, not affiliated with The Indie Stone.
