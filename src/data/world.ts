// Project Zomboid world model.
// Coordinates are game "tile" coordinates: x grows east, y grows south.
// B42 shares this coordinate origin with B41.

export const WORLD = {
  minX: 0,
  minY: 0,
  maxX: 19800,
  maxY: 15900,
} as const;

/** The populated part of the map — used to frame the schematic view. */
export const FIT_BOUNDS = { minX: 0, minY: 0, maxX: 15360, maxY: 15360 } as const;

export type XY = readonly [x: number, y: number];
