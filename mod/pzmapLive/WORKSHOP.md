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

**Solo**: install this mod, open pzmap, click "Share my location" and pick your
`Zomboid/Lua/pzmap-live.json` file — once, ever. It's remembered after that: your marker just
shows up on future visits, no re-picking. No server, no account.

**Friends**: the moment you're sharing, pzmap gives you a link (Copy link in the sidebar).
Send it — anyone who opens it sees your marker live, without installing anything themselves.

**Whole server**: server admins enable this mod's server half and run `pzmap-bridge` — a
single downloadable program, no Node.js or npm required — to put connected players on the
map. Positions are tagged with in-game faction, and `pzmap-bridge --group <faction>` scopes a
room to just that faction, so rival factions don't see each other by default. See the pzmap
repo README for setup.

Unofficial fan project, not affiliated with The Indie Stone.
