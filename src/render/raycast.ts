/**
 * Presentation-only ray casting used to draw how far a warning line reaches. It never
 * decides a hit: bolts, cuts and damage are resolved by the simulation.
 */
import type { RectDef, RoomDef } from '../sim/types';
import type { Vec2 } from '../sim/vec';

/** Entry distance of a ray into an axis-aligned rectangle (slab method), or Infinity. */
export function rayRect(origin: Vec2, dir: Vec2, rect: RectDef): number {
  let tMin = -Infinity;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [origin.x, dir.x, rect.x, rect.x + rect.w],
    [origin.y, dir.y, rect.y, rect.y + rect.h],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  if (tMax < 0) return Infinity;
  return Math.max(0, tMin);
}

/** Distance along a unit direction until a wall or the room boundary. */
export function rayToWalls(origin: Vec2, dir: Vec2, room: Pick<RoomDef, 'width' | 'height' | 'walls'>): number {
  let best = Infinity;
  // Room boundary (exit distance from the inside).
  if (dir.x > 1e-12) best = Math.min(best, (room.width - origin.x) / dir.x);
  if (dir.x < -1e-12) best = Math.min(best, -origin.x / dir.x);
  if (dir.y > 1e-12) best = Math.min(best, (room.height - origin.y) / dir.y);
  if (dir.y < -1e-12) best = Math.min(best, -origin.y / dir.y);
  for (const wall of room.walls) {
    const t = rayRect(origin, dir, wall);
    if (t < best) best = t;
  }
  return Number.isFinite(best) ? Math.max(0, best) : 0;
}
