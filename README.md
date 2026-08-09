# Knox Country — Project Zomboid B42 Map

**Live at [knoxcountymap.com](https://www.knoxcountymap.com)**

An interactive map of Knox Country for Project Zomboid Build 42, built with Vite + React + TypeScript + Leaflet.

## Features

- **Isometric map** — the actual in-game look: a full isometric render of the B42 world produced locally from your game install with [pzmap2dzi](https://github.com/cff29546/pzmap2dzi), served as a deep-zoom tile pyramid. Underneath it sits a schematic layer (roads, buildings, water, forest — extracted from the game's `worldmap.xml` and drawn in the same isometric projection), so the whole map is always visible even where tiles haven't rendered yet.
- **Street search** — all 1,098 named B42 streets (from the game's `streets.xml`), grouped by town. Selecting one highlights its full geometry on either view.
- **Town & POI search with category filters** — towns from PZwiki B42 coordinates, plus a curated (approximate) POI set: medical, police, fire, guns, shops, gas, military, landmarks, industrial.
- **Street name on hover**, cursor coordinate readout in game tiles, shareable URL hash (`#x=…&y=…&z=…`), "Copy coords", and a deep link to the PZ Map Project at the same spot.

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

### Self-hosting on your LAN

Once you've built `public/mapdata/` (above) and rendered your isometric tiles (above), you can
serve the whole thing to your household over Docker instead of running `npm run dev`:

```sh
cp .env.example .env
# edit .env: point PZMAP_TILES_DIR at your pzmap2dzi output
# (the same …/html/map_data/base directory from "Isometric tiles" above)
docker compose up -d --build
```

The map is now at `http://<this-machine's-LAN-IP>:8080` (default port, override via `PZMAP_PORT`
in `.env`) for anyone on the same network. There's no login and no HTTPS — it's built for a
trusted home LAN, not the internet. Don't forward the port through your router.

To update after pulling new commits: `docker compose up -d --build`. To pick up a re-render of
your tiles, no rebuild is needed — the tiles directory is mounted live, so a new render just
appears (refresh the browser).

Stop it with `docker compose down`.

## Notes

- World coordinates are game tile coordinates (x east, y south).
- Town positions come from PZwiki B42 infoboxes. POI positions are community approximations — edit `src/data/locations.ts`.
- Unofficial fan project. Game assets © The Indie Stone.
