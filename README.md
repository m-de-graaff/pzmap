# Knox Country — Project Zomboid B42 Map

An interactive map of Knox Country for Project Zomboid Build 42, built with Vite + React + TypeScript + Leaflet.

## Features

- **Isometric map** — the actual in-game look: a full isometric render of the B42 world produced locally from your game install with [pzmap2dzi](https://github.com/cff29546/pzmap2dzi), served as a deep-zoom tile pyramid. Underneath it sits a schematic layer (roads, buildings, water, forest — extracted from the game's `worldmap.xml` and drawn in the same isometric projection), so the whole map is always visible even where tiles haven't rendered yet.
- **Street search** — all 1,098 named B42 streets (from the game's `streets.xml`), grouped by town. Selecting one highlights its full geometry on either view.
- **Town & POI search with category filters** — towns from PZwiki B42 coordinates, plus a curated (approximate) POI set: medical, police, fire, guns, shops, gas, military, landmarks, industrial.
- **Street name on hover**, cursor coordinate readout in game tiles, shareable URL hash (`#x=…&y=…&z=…`), "Copy coords", and a deep link to the PZ Map Project at the same spot.

### Live location (experimental)

Install the **pzmap Live** Workshop mod (`mod/pzmapLive` in this repo) and it writes your
character's position to `Zomboid/Lua/pzmap-live.json` while you play. Click "Share my
location" in the sidebar and pick that file — **once, ever**. The browser remembers it after
that: next time you open pzmap, your marker just appears, with a "Follow me" toggle, no
re-picking, no button to click. Everything happens in your browser — no account, nothing to
install beyond the mod itself.

**Friends**: the moment you're sharing, the page URL carries a `room=` link — click "Copy
link" and send it. Whoever opens it sees your marker live with zero setup on their end: no
mod, no file, nothing. If they're also sharing their own location, opening your link puts
both of you in the same room automatically.

**Whole server**: a server admin enables the mod's server half (writes every online player to
the server's `Zomboid/Lua/pzmap-live-server.json`) and runs `pzmap-bridge` — a single
downloadable program, not an npm package — to publish the whole roster into a room. Windows
and Linux binaries both exist; there's a specific walkthrough for Pelican/Pterodactyl-style
panels (which only allow one startup command) too. Positions are tagged with the player's
in-game faction, and `pzmap-bridge --group <faction>` scopes a room to just that faction —
by default, showing everyone to everyone is a real fairness problem on servers with rival
factions, so this isn't optional in the docs even though the flag itself is. See
`bridge/README.md`. If you're self-hosting on your own PC, you likely don't need the bridge
at all — same README, "Do you even need this?".

The friends/server-wide relay is a small Cloudflare Worker (`relay/`) hosted once, centrally —
not something each player or server owner deploys themselves.

## Getting started

```sh
npm install
npm run build:mapdata   # extracts map data from your PZ install (see below)
npm run dev
```

### Map data extraction

`npm run build:mapdata` reads the in-game world map data from a local Project Zomboid B42 installation and writes compact JSON to `public/mapdata/`:

- `media/maps/Muldraugh, KY/worldmap.xml` → water, roads, rail, building footprints
- `media/maps/Muldraugh, KY/worldmap-forest.xml` → simplified forest polygons
- `media/maps/Muldraugh, KY/streets.xml` → named street centerlines

The install path defaults to `D:/SteamLibrary/steamapps/common/ProjectZomboid`; pass a different one as an argument:

```sh
node scripts/build-map-data.mjs "C:/Program Files (x86)/Steam/steamapps/common/ProjectZomboid"
```

### Isometric tiles

The isometric view reads a local [pzmap2dzi](https://github.com/cff29546/pzmap2dzi) render. One-time setup (the render itself takes several hours; the app shows tiles progressively as they appear):

```sh
git clone https://github.com/cff29546/pzmap2dzi D:/Development/pzmap2dzi
cd D:/Development/pzmap2dzi
pip install -r requirements.txt
# edit conf/conf.yaml: pz_root, output_root (D:/Development/pzmap-tiles),
# save_games: [], layer_range: [0, 1], omit_levels[default](base): 1
python main.py deploy && python main.py unpack && python main.py render base
```

The dev server serves the pyramid at `/tiles/` (see `serveTiles` in `vite.config.ts`; override the location with the `PZMAP_TILES_DIR` env var). `src/data/tilesource.ts` reads `map_info.json` at runtime for the image size and isometric projection constants, so re-renders with different settings just work. For a production deployment, serve `…/html/map_data/base/` at `/tiles/` with any static file server.

## Notes

- World coordinates are game tile coordinates (x east, y south).
- Town positions come from PZwiki B42 infoboxes. POI positions are community approximations — edit `src/data/locations.ts`.
- Unofficial fan project. Game assets © The Indie Stone.
