// Searchable locations for the B42 Knox Country map.
//
// Town coordinates are sourced from PZwiki infoboxes (Build 42.x pages).
// POI and street positions are community-curated approximations near the real
// spots — edit freely, this file is the single source of truth for markers.

export type Category =
  | 'town'
  | 'street'
  | 'medical'
  | 'police'
  | 'fire'
  | 'gun'
  | 'shop'
  | 'gas'
  | 'military'
  | 'landmark'
  | 'industrial';

export interface CategoryInfo {
  label: string;
  color: string;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  town: { label: 'Towns', color: '#f5a623' },
  street: { label: 'Streets & roads', color: '#aab2a0' },
  medical: { label: 'Medical', color: '#ef5350' },
  police: { label: 'Police', color: '#64b5f6' },
  fire: { label: 'Fire dept', color: '#ff8a3d' },
  gun: { label: 'Guns', color: '#e6c229' },
  shop: { label: 'Food & shops', color: '#81c784' },
  gas: { label: 'Gas stations', color: '#ba68c8' },
  military: { label: 'Military', color: '#8d9c6b' },
  landmark: { label: 'Landmarks', color: '#4dd0e1' },
  industrial: { label: 'Industrial', color: '#a1887f' },
};

export interface Location {
  id: string;
  name: string;
  cat: Category;
  x: number;
  y: number;
  town?: string;
  desc?: string;
  aliases?: string[];
  /** Position is an approximation, not a verified in-game coordinate. */
  approx?: boolean;
  /** Street geometry: polyline segments as flat [x0,y0,x1,y1,…] arrays. */
  pts?: number[][];
}

export const TOWNS: Location[] = [
  { id: 'louisville', name: 'Louisville', cat: 'town', x: 12500, y: 1800, desc: 'The big city on the Ohio River. Dense, dangerous, full of loot.', aliases: ['LV'] },
  { id: 'west-point', name: 'West Point', cat: 'town', x: 11920, y: 6900, desc: 'River town at the bend of the Ohio. Classic mid-game destination.' },
  { id: 'muldraugh', name: 'Muldraugh', cat: 'town', x: 10593, y: 9738, desc: 'The original starting town, strung along Dixie Highway.' },
  { id: 'riverside', name: 'Riverside', cat: 'town', x: 6435, y: 5282, desc: 'Quiet riverside community with a country club and marina.' },
  { id: 'rosewood', name: 'Rosewood', cat: 'town', x: 8105, y: 11578, desc: 'Small county seat with a fire department and a prison nearby.' },
  { id: 'march-ridge', name: 'March Ridge', cat: 'town', x: 10088, y: 12696, desc: 'Isolated planned community deep in the exclusion zone.' },
  { id: 'valley-station', name: 'Valley Station', cat: 'town', x: 12672, y: 5718, desc: 'Suburban sprawl between Louisville and West Point.' },
  { id: 'dixie', name: 'Dixie Mobile Park', cat: 'town', x: 11533, y: 8777, desc: 'Trailer park and truck stop on Dixie Highway.', aliases: ['Dixie'] },
  { id: 'fallas-lake', name: 'Fallas Lake', cat: 'town', x: 7276, y: 8332, desc: 'Lakeside village west of Muldraugh (called Ekron by the community in B41).' },
  { id: 'doe-valley', name: 'Doe Valley', cat: 'town', x: 6734, y: 10020, desc: 'Golf-and-lake resort community. New in B42.' },
  { id: 'echo-creek', name: 'Echo Creek', cat: 'town', x: 3600, y: 10925, desc: 'Small farming town surrounded by fields and forest. New in B42.' },
  { id: 'ekron', name: 'Ekron', cat: 'town', x: 546, y: 9891, desc: 'Tiny far-west town, population under 200. New in B42.' },
  { id: 'brandenburg', name: 'Brandenburg', cat: 'town', x: 2114, y: 6000, desc: 'Historic river town in the north-west. New in B42.' },
  { id: 'irvington', name: 'Irvington', cat: 'town', x: 2498, y: 14253, desc: 'Railroad town in the far south-west. New in B42.' },
];

// Named streets are loaded from the game's streets.xml at runtime
// (see scripts/build-map-data.mjs and src/lib/streets.ts).

export const POIS: Location[] = [
  // Louisville
  { id: 'grand-ohio-mall', name: 'Grand Ohio Mall', cat: 'landmark', x: 13050, y: 1150, town: 'Louisville', desc: 'The biggest loot dungeon in Knox Country.', aliases: ['Mall'], approx: true },
  { id: 'lv-hospital', name: 'Louisville Medical Center', cat: 'medical', x: 12730, y: 2100, town: 'Louisville', desc: 'Large hospital complex. Bring a weapon, leave with meds.', approx: true },
  { id: 'lv-police', name: 'Louisville Police Dept', cat: 'police', x: 12550, y: 1650, town: 'Louisville', approx: true },
  { id: 'lv-fire', name: 'Louisville Fire Station', cat: 'fire', x: 12450, y: 1750, town: 'Louisville', approx: true },
  { id: 'lv-gun', name: 'Louisville Gun Store', cat: 'gun', x: 12200, y: 2300, town: 'Louisville', approx: true },

  // West Point
  { id: 'twiggys', name: "Twiggy's Bar", cat: 'shop', x: 11750, y: 6880, town: 'West Point', desc: 'Infamous riverside bar.', approx: true },
  { id: 'wp-gun', name: 'West Point Gun Store', cat: 'gun', x: 12050, y: 6950, town: 'West Point', approx: true },
  { id: 'wp-police', name: 'West Point Police Station', cat: 'police', x: 11900, y: 6890, town: 'West Point', approx: true },
  { id: 'wp-grocery', name: 'West Point Grocery', cat: 'shop', x: 11840, y: 6930, town: 'West Point', approx: true },

  // Muldraugh
  { id: 'cortman', name: 'Cortman Medical', cat: 'medical', x: 10640, y: 9300, town: 'Muldraugh', desc: 'Small clinic on the north end of town.', approx: true },
  { id: 'mul-police', name: 'Muldraugh Police Station', cat: 'police', x: 10610, y: 9750, town: 'Muldraugh', approx: true },
  { id: 'knox-bank', name: 'Knox Bank', cat: 'landmark', x: 10600, y: 9720, town: 'Muldraugh', approx: true },
  { id: 'mul-warehouse', name: 'Muldraugh Big Warehouse', cat: 'industrial', x: 10730, y: 10370, town: 'Muldraugh', desc: 'The legendary southern warehouse base spot.', approx: true },
  { id: 'sunstar', name: 'Sunstar Motel', cat: 'landmark', x: 10380, y: 9210, town: 'Muldraugh', approx: true },
  { id: 'mul-gas', name: 'Gas-2-Go Muldraugh', cat: 'gas', x: 10560, y: 9540, town: 'Muldraugh', approx: true },

  // Dixie
  { id: 'dixie-truckstop', name: 'Dixie Truck Stop', cat: 'gas', x: 11520, y: 8790, town: 'Dixie Mobile Park', approx: true },

  // Riverside
  { id: 'riv-police', name: 'Riverside Police Station', cat: 'police', x: 6420, y: 5290, town: 'Riverside', approx: true },
  { id: 'riv-school', name: 'Riverside School', cat: 'landmark', x: 6250, y: 5350, town: 'Riverside', approx: true },
  { id: 'knox-marina', name: 'Riverside Marina', cat: 'landmark', x: 6700, y: 5200, town: 'Riverside', approx: true },
  { id: 'riv-country-club', name: 'Riverside Country Club', cat: 'landmark', x: 6150, y: 5450, town: 'Riverside', approx: true },

  // Rosewood
  { id: 'rw-prison', name: 'Knox County Prison', cat: 'landmark', x: 7350, y: 11660, town: 'Rosewood', desc: 'Fortress-grade base west of Rosewood.', aliases: ['Rosewood Prison'], approx: true },
  { id: 'rw-fire', name: 'Rosewood Fire Department', cat: 'fire', x: 8090, y: 11560, town: 'Rosewood', desc: 'Popular starter base.', approx: true },
  { id: 'rw-police', name: 'Rosewood Police Station', cat: 'police', x: 8130, y: 11600, town: 'Rosewood', approx: true },
  { id: 'rw-gas', name: 'Rosewood Gas Station', cat: 'gas', x: 8000, y: 11500, town: 'Rosewood', approx: true },

  // March Ridge
  { id: 'mr-police', name: 'March Ridge Police Station', cat: 'police', x: 10080, y: 12700, town: 'March Ridge', approx: true },
  { id: 'mr-clinic', name: 'March Ridge Medical Clinic', cat: 'medical', x: 10050, y: 12730, town: 'March Ridge', approx: true },
  { id: 'mr-checkpoint', name: 'Army Checkpoint (South)', cat: 'military', x: 10060, y: 13300, town: 'March Ridge', desc: 'Military roadblock on the highway south.', approx: true },

  // Valley Station
  { id: 'vs-grocery', name: "Greene's Grocery", cat: 'shop', x: 12650, y: 5700, town: 'Valley Station', approx: true },
  { id: 'vs-gas', name: 'Valley Station Gas', cat: 'gas', x: 12700, y: 5760, town: 'Valley Station', approx: true },

  // Fallas Lake
  { id: 'fl-police', name: 'Fallas Lake Police Station', cat: 'police', x: 7260, y: 8400, town: 'Fallas Lake', approx: true },
  { id: 'fl-doctor', name: "Fallas Lake Doctor's Office", cat: 'medical', x: 7266, y: 8434, town: 'Fallas Lake', desc: 'On the main road through the centre of town.' },
  { id: 'fl-bait', name: 'Lakeview Bait & Tackle', cat: 'shop', x: 7420, y: 8280, town: 'Fallas Lake', approx: true },

  // Doe Valley
  { id: 'dv-club', name: 'Doe Valley Country Club', cat: 'landmark', x: 6800, y: 10100, town: 'Doe Valley', approx: true },
  { id: 'dv-marina', name: 'Doe Valley Marina', cat: 'landmark', x: 6550, y: 10050, town: 'Doe Valley', approx: true },

  // Echo Creek
  { id: 'ec-farm-supply', name: 'Echo Creek Farm & Rural Supply', cat: 'shop', x: 3620, y: 10900, town: 'Echo Creek', approx: true },
  { id: 'ec-gas', name: 'Echo Creek Gas Station', cat: 'gas', x: 3560, y: 10970, town: 'Echo Creek', approx: true },
  { id: 'ec-school', name: 'Echo Creek School', cat: 'landmark', x: 3650, y: 10880, town: 'Echo Creek', approx: true },

  // Ekron
  { id: 'ek-store', name: 'Ekron General Store', cat: 'shop', x: 560, y: 9880, town: 'Ekron', approx: true },
  { id: 'ek-gas', name: 'Ekron Gas Pump', cat: 'gas', x: 520, y: 9910, town: 'Ekron', approx: true },

  // Brandenburg
  { id: 'bb-courthouse', name: 'Brandenburg Courthouse', cat: 'landmark', x: 2100, y: 6010, town: 'Brandenburg', approx: true },
  { id: 'bb-clinic', name: 'Riverfront Medical Clinic', cat: 'medical', x: 2160, y: 5950, town: 'Brandenburg', approx: true },
  { id: 'bb-police', name: 'Brandenburg Police Station', cat: 'police', x: 2080, y: 6030, town: 'Brandenburg', approx: true },
  { id: 'bb-gun', name: 'Brandenburg Firearms', cat: 'gun', x: 2200, y: 6080, town: 'Brandenburg', approx: true },

  // Irvington
  { id: 'irv-police', name: 'Irvington Police Station', cat: 'police', x: 2500, y: 14250, town: 'Irvington', approx: true },
  { id: 'irv-depot', name: 'Irvington Rail Depot', cat: 'industrial', x: 2460, y: 14200, town: 'Irvington', approx: true },
  { id: 'irv-grocery', name: 'Irvington Grocery', cat: 'shop', x: 2530, y: 14290, town: 'Irvington', approx: true },
];

export const ALL_LOCATIONS: Location[] = [...TOWNS, ...POIS];
