// Extracts the in-game world map vector data from a Project Zomboid B42
// install into compact JSON used by the app.
//
//   node scripts/build-map-data.mjs [path-to-ProjectZomboid]
//
// Reads:  media/maps/Muldraugh, KY/{worldmap.xml, worldmap-forest.xml, streets.xml}
// Writes: public/mapdata/{base.json, buildings.json, forest.json, streets.json}
//
// worldmap*.xml store features per 300x300-tile cell with cell-local coords;
// streets.xml is already in absolute world coords.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CELL = 300;
const gameDir = process.argv[2] ?? 'D:/SteamLibrary/steamapps/common/ProjectZomboid';
const mapDir = join(gameDir, 'media/maps/Muldraugh, KY');
const outDir = new URL('../public/mapdata/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(outDir, { recursive: true });

/** Parse worldmap-style XML into features with absolute integer coords. */
function parseCells(xml, onFeature) {
  const cellRe = /<cell x="(\d+)" y="(\d+)">([\s\S]*?)<\/cell>/g;
  const featRe = /<feature>([\s\S]*?)<\/feature>/g;
  const ringRe = /<coordinates>([\s\S]*?)<\/coordinates>/g;
  const pointRe = /<point x="(-?[\d.]+)" y="(-?[\d.]+)"/g;
  const propRe = /<property name="([^"]+)" value="([^"]*)"/g;
  let cm;
  while ((cm = cellRe.exec(xml))) {
    const ox = Number(cm[1]) * CELL;
    const oy = Number(cm[2]) * CELL;
    const body = cm[3];
    let fm;
    while ((fm = featRe.exec(body))) {
      const block = fm[1];
      const rings = [];
      let rm;
      while ((rm = ringRe.exec(block))) {
        const ring = [];
        let pm;
        while ((pm = pointRe.exec(rm[1]))) {
          ring.push(Math.round(ox + Number(pm[1])), Math.round(oy + Number(pm[2])));
        }
        if (ring.length >= 6) rings.push(ring);
      }
      const props = {};
      let m;
      while ((m = propRe.exec(block))) props[m[1]] = m[2];
      if (rings.length) onFeature(rings, props);
    }
  }
}

/** Drop consecutive points closer than eps (keeps first/last). */
function decimate(ring, eps) {
  const out = [ring[0], ring[1]];
  let lx = ring[0], ly = ring[1];
  for (let i = 2; i < ring.length - 2; i += 2) {
    const dx = ring[i] - lx, dy = ring[i + 1] - ly;
    if (dx * dx + dy * dy >= eps * eps) {
      out.push(ring[i], ring[i + 1]);
      lx = ring[i]; ly = ring[i + 1];
    }
  }
  out.push(ring[ring.length - 2], ring[ring.length - 1]);
  return out;
}

function bboxDims(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < minX) minX = r[i];
      if (r[i] > maxX) maxX = r[i];
      if (r[i + 1] < minY) minY = r[i + 1];
      if (r[i + 1] > maxY) maxY = r[i + 1];
    }
  }
  return [maxX - minX, maxY - minY];
}

// ---- worldmap.xml: water, roads, rail, buildings ----
console.log('parsing worldmap.xml …');
const base = { water: [], rail: [], roads: { primary: [], secondary: [], tertiary: [], trail: [] } };
const buildings = {};
let skipped = 0;
parseCells(readFileSync(join(mapDir, 'worldmap.xml'), 'utf8'), (rings, props) => {
  if (props.water) base.water.push(rings);
  else if (props.railway) base.rail.push(rings);
  else if (props.highway) {
    (base.roads[props.highway] ??= []).push(rings);
  } else if (props.building) {
    const cat = props.building === 'yes' ? 'Other' : props.building;
    (buildings[cat] ??= []).push(rings);
  } else skipped++;
});

// ---- worldmap-forest.xml: simplify aggressively ----
console.log('parsing worldmap-forest.xml …');
const forest = [];
let forestDropped = 0;
parseCells(readFileSync(join(mapDir, 'worldmap-forest.xml'), 'utf8'), (rings) => {
  const [w, h] = bboxDims(rings);
  if (w < 20 && h < 20) { forestDropped++; return; }
  forest.push(rings.map((r) => decimate(r, 8)));
});

// ---- streets.xml: named centerlines, absolute coords ----
console.log('parsing streets.xml …');
const streetsXml = readFileSync(join(mapDir, 'streets.xml'), 'utf8');
const streets = [];
const streetRe = /<street name="([^"]+)" width="([\d.]+)">([\s\S]*?)<\/street>/g;
const pointRe = /<point x="(-?[\d.]+)" y="(-?[\d.]+)"/g;
let sm;
while ((sm = streetRe.exec(streetsXml))) {
  const pts = [];
  let pm;
  while ((pm = pointRe.exec(sm[3]))) pts.push(Math.round(Number(pm[1])), Math.round(Number(pm[2])));
  if (pts.length >= 4) streets.push({ n: sm[1], w: Number(sm[2]), p: pts });
}

const write = (name, data) => {
  const json = JSON.stringify(data);
  writeFileSync(join(outDir, name), json);
  console.log(`${name}: ${(json.length / 1024 / 1024).toFixed(2)} MB`);
};
write('base.json', base);
write('buildings.json', buildings);
write('forest.json', forest);
write('streets.json', streets);
console.log(
  `water ${base.water.length}, rail ${base.rail.length}, roads ${Object.values(base.roads).map((r) => r.length).join('/')}, ` +
  `buildings ${Object.values(buildings).reduce((s, a) => s + a.length, 0)}, forest ${forest.length} (dropped ${forestDropped}), ` +
  `streets ${streets.length}, other-skipped ${skipped}`,
);
