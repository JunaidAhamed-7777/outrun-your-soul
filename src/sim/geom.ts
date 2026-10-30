/**
 * Swept-circle geometry on the gameplay plane. Walls are axis-aligned rectangles;
 * the room boundary is an implicit wall. All sweeps are closed-form (no sampling).
 */
import type { RectDef, RoomDef } from './types';
import { add, dot, scale, sub, type Vec2 } from './vec';

/** Distances within this band count as touching rather than overlapping. */
export const TOUCH_TOLERANCE = 1e-9;

export interface SweepHit {
  /** Fraction of the displacement travelled before first contact, in [0, 1]. */
  readonly t: number;
  /** Outward surface normal at the contact (points from the obstacle toward the mover). */
  readonly normal: Vec2;
}

export function pointInRect(p: Vec2, r: RectDef): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Signed distance from a point to a rectangle (negative inside) and the outward
 * direction of steepest increase.
 */
export function rectSignedDistance(p: Vec2, r: RectDef): { d: number; n: Vec2 } {
  const hx = r.w / 2;
  const hy = r.h / 2;
  const cx = r.x + hx;
  const cy = r.y + hy;
  const sx = p.x - cx >= 0 ? 1 : -1;
  const sy = p.y - cy >= 0 ? 1 : -1;
  const qx = Math.abs(p.x - cx) - hx;
  const qy = Math.abs(p.y - cy) - hy;
  if (qx > 0 || qy > 0) {
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const d = Math.hypot(ox, oy);
    return { d, n: { x: (sx * ox) / d, y: (sy * oy) / d } };
  }
  if (qx > qy) return { d: qx, n: { x: sx, y: 0 } };
  return { d: qy, n: { x: 0, y: sy } };
}

/** True when a circle overlaps (or exactly touches) a rectangle. */
export function circleOverlapsRect(c: Vec2, radius: number, r: RectDef): boolean {
  return rectSignedDistance(c, r).d <= radius;
}

/** Entry time of segment p0 + t*d (t in [0,1]) into an AABB; Infinity if none. */
function rayAabbEntry(p0: Vec2, d: Vec2, minX: number, minY: number, maxX: number, maxY: number): number {
  let tEnter = -Infinity;
  let tExit = Infinity;
  if (Math.abs(d.x) < 1e-15) {
    if (p0.x < minX || p0.x > maxX) return Infinity;
  } else {
    const t1 = (minX - p0.x) / d.x;
    const t2 = (maxX - p0.x) / d.x;
    tEnter = Math.max(tEnter, Math.min(t1, t2));
    tExit = Math.min(tExit, Math.max(t1, t2));
  }
  if (Math.abs(d.y) < 1e-15) {
    if (p0.y < minY || p0.y > maxY) return Infinity;
  } else {
    const t1 = (minY - p0.y) / d.y;
    const t2 = (maxY - p0.y) / d.y;
    tEnter = Math.max(tEnter, Math.min(t1, t2));
    tExit = Math.min(tExit, Math.max(t1, t2));
  }
  if (tEnter > tExit || tExit < 0 || tEnter > 1) return Infinity;
  return Math.max(tEnter, 0);
}

/** Entry time of segment p0 + t*d into a circle; Infinity if none or moving away. */
function rayCircleEntry(p0: Vec2, d: Vec2, c: Vec2, radius: number): number {
  const m = sub(p0, c);
  const a = dot(d, d);
  if (a < 1e-30) return Infinity;
  const b = dot(m, d);
  const cc = dot(m, m) - radius * radius;
  if (cc <= 0) return b < 0 ? 0 : Infinity;
  if (b >= 0) return Infinity;
  const disc = b * b - a * cc;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t <= 1 ? Math.max(t, 0) : Infinity;
}

/**
 * First contact of a circle (centre moving p0 -> p0 + disp) with a rectangle, or null.
 * Starting overlap counts as a hit at t=0; exact touching counts only when moving inward.
 */
export function sweepCircleRect(p0: Vec2, disp: Vec2, radius: number, r: RectDef): SweepHit | null {
  const start = rectSignedDistance(p0, r);
  const gap = start.d - radius;
  if (gap < -TOUCH_TOLERANCE) return { t: 0, normal: start.n };
  if (gap <= TOUCH_TOLERANCE) {
    return dot(disp, start.n) < 0 ? { t: 0, normal: start.n } : null;
  }
  let t = Math.min(
    rayAabbEntry(p0, disp, r.x - radius, r.y, r.x + r.w + radius, r.y + r.h),
    rayAabbEntry(p0, disp, r.x, r.y - radius, r.x + r.w, r.y + r.h + radius),
  );
  const corners: Vec2[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ];
  for (const c of corners) t = Math.min(t, rayCircleEntry(p0, disp, c, radius));
  if (!(t <= 1)) return null;
  const at = add(p0, scale(disp, t));
  return { t, normal: rectSignedDistance(at, r).n };
}

/**
 * First contact of a circle against the room boundary and every wall. The centre must
 * stay inside [radius, width - radius] x [radius, height - radius].
 */
export function sweepCircle(room: RoomDef, p0: Vec2, disp: Vec2, radius: number): SweepHit | null {
  let best: SweepHit | null = null;
  const consider = (hit: SweepHit | null): void => {
    if (hit && (best === null || hit.t < best.t)) best = hit;
  };
  consider(boundAxis(p0.x, disp.x, radius, room.width - radius, { x: 1, y: 0 }));
  consider(boundAxis(p0.y, disp.y, radius, room.height - radius, { x: 0, y: 1 }));
  for (const wall of room.walls) consider(sweepCircleRect(p0, disp, radius, wall));
  return best;
}

function boundAxis(p: number, d: number, lo: number, hi: number, axis: Vec2): SweepHit | null {
  if (d < 0) {
    const gap = p - lo;
    if (gap <= TOUCH_TOLERANCE) return { t: 0, normal: axis };
    const t = gap / -d;
    return t <= 1 ? { t, normal: axis } : null;
  }
  if (d > 0) {
    const gap = hi - p;
    if (gap <= TOUCH_TOLERANCE) return { t: 0, normal: scale(axis, -1) };
    const t = gap / d;
    return t <= 1 ? { t, normal: scale(axis, -1) } : null;
  }
  return null;
}

/** True when a stationary circle is clear of walls and inside the room bounds. */
export function circleClear(room: RoomDef, c: Vec2, radius: number): boolean {
  if (c.x < radius - TOUCH_TOLERANCE || c.x > room.width - radius + TOUCH_TOLERANCE) return false;
  if (c.y < radius - TOUCH_TOLERANCE || c.y > room.height - radius + TOUCH_TOLERANCE) return false;
  return room.walls.every((w) => rectSignedDistance(c, w).d >= radius - TOUCH_TOLERANCE);
}

/** True when a circle can sweep from a to b (full radius, including final footprint) without touching walls. */
export function corridorClear(room: RoomDef, a: Vec2, b: Vec2, radius: number): boolean {
  if (!circleClear(room, a, radius) || !circleClear(room, b, radius)) return false;
  const disp = sub(b, a);
  if (dot(disp, disp) < 1e-24) return true;
  const hit = sweepCircle(room, a, disp, radius);
  // Touching a wall while sliding parallel is legal; only an inward entry before the end blocks.
  return hit === null || hit.t >= 1 - 1e-12;
}

/**
 * Earliest time in [0, tMax] at which two moving circles reach centre distance `reach`,
 * given relative position `rel` (a - b) and relative velocity `relVel` (va - vb).
 * Returns 0 when they already overlap, null when they never touch in the window.
 */
export function circleTimeOfImpact(rel: Vec2, relVel: Vec2, reach: number, tMax: number): number | null {
  const c = dot(rel, rel) - reach * reach;
  if (c <= 0) return 0;
  const a = dot(relVel, relVel);
  if (a < 1e-30) return null;
  const b = dot(rel, relVel);
  if (b >= 0) return null;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t <= tMax ? Math.max(t, 0) : null;
}

/**
 * Entry time of a circle moving p0 -> p0 + disp into a non-wall rectangle region
 * (lanes, exits). Returns 0 when already overlapping, null when it never enters.
 */
export function circleEntersRect(p0: Vec2, disp: Vec2, radius: number, r: RectDef): number | null {
  if (rectSignedDistance(p0, r).d <= radius) return 0;
  const hit = sweepCircleRect(p0, disp, radius, r);
  return hit ? hit.t : null;
}
