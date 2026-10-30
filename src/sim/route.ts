/**
 * The living tether: an ordered polyline from soul (head, index 0) to body (tail).
 * Outward travel appends at the tail; the soul consumes the head; RETURN consumes the
 * tail. Corners are preserved; only redundant forward-collinear points are merged.
 */
import { TUNING } from './tuning';
import type { RouteState } from './types';
import { add, cross, dist, dot, len, scale, sub, type Vec2 } from './vec';

const COLLINEAR_TOLERANCE = 1e-9;

export function polylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  return total;
}

export function recomputeLength(route: RouteState): void {
  route.length = polylineLength(route.points);
}

export function isSeparated(route: RouteState): boolean {
  return route.points.length > 0;
}

export function clearRoute(route: RouteState): void {
  route.points = [];
  route.length = 0;
}

export function head(route: RouteState): Vec2 | undefined {
  return route.points[0];
}

export function tail(route: RouteState): Vec2 | undefined {
  return route.points[route.points.length - 1];
}

/**
 * Point at arc length `s` from the head. Beyond the end it continues along
 * `extendDir` when given (a tail that is still being extended by a dash), otherwise clamps.
 */
export function pointAtArc(points: readonly Vec2[], s: number, extendDir?: Vec2): Vec2 {
  const first = points[0];
  if (!first) throw new Error('pointAtArc on empty route');
  if (s <= 0) return first;
  let remaining = s;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = dist(a, b);
    if (remaining <= seg) {
      return seg > 0 ? add(a, scale(sub(b, a), remaining / seg)) : b;
    }
    remaining -= seg;
  }
  const last = points[points.length - 1]!;
  return extendDir ? add(last, scale(extendDir, remaining)) : last;
}

/** Cumulative arc length at each interior vertex (the corners between head and tail). */
export function cornerArcs(points: readonly Vec2[]): number[] {
  const arcs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length - 1; i++) {
    total += dist(points[i - 1]!, points[i]!);
    arcs.push(total);
  }
  return arcs;
}

/**
 * Advance the head by `d` along the route, dropping passed vertices. The caller
 * guarantees d does not exceed the length (exhaustion is resolved as an event first);
 * any overshoot clamps to the tail.
 */
export function consumeHead(route: RouteState, d: number): void {
  const pts = route.points;
  let remaining = d;
  while (remaining > 0 && pts.length >= 2) {
    const a = pts[0]!;
    const b = pts[1]!;
    const seg = dist(a, b);
    if (remaining >= seg) {
      pts.shift();
      remaining -= seg;
    } else {
      pts[0] = add(a, scale(sub(b, a), remaining / seg));
      remaining = 0;
    }
  }
  if (pts.length === 1) pts.push(pts[0]!);
  recomputeLength(route);
}

/** Retract the tail by `d` along the route (RETURN), dropping passed vertices. */
export function consumeTail(route: RouteState, d: number): void {
  const pts = route.points;
  let remaining = d;
  while (remaining > 0 && pts.length >= 2) {
    const a = pts[pts.length - 1]!;
    const b = pts[pts.length - 2]!;
    const seg = dist(a, b);
    if (remaining >= seg) {
      pts.pop();
      remaining -= seg;
    } else {
      pts[pts.length - 1] = add(a, scale(sub(b, a), remaining / seg));
      remaining = 0;
    }
  }
  if (pts.length === 1) pts.push(pts[0]!);
  recomputeLength(route);
}

/** Whether starting outward travel in `dir` from the tail requires a new stored vertex. */
export function needsNewVertex(route: RouteState, dir: Vec2): boolean {
  const pts = route.points;
  if (pts.length < 2) return true;
  const a = pts[pts.length - 2]!;
  const b = pts[pts.length - 1]!;
  const segVec = sub(b, a);
  const segLen = len(segVec);
  if (segLen < TUNING.geomEpsilon) return false; // a zero-length tail segment is reused
  const u = scale(segVec, 1 / segLen);
  return !(Math.abs(cross(u, dir)) <= COLLINEAR_TOLERANCE && dot(u, dir) > 0);
}

/** Vertex count after beginning outward travel in `dir` (for the representation cap). */
export function vertexCountAfterAppend(route: RouteState, dir: Vec2): number {
  if (route.points.length === 0) return 2;
  return route.points.length + (needsNewVertex(route, dir) ? 1 : 0);
}

/**
 * Prepare the tail for outward travel from `from` (the current body position) in `dir`.
 * Afterwards the last point is the moving tail; move it with setTail.
 */
export function beginAppend(route: RouteState, from: Vec2, dir: Vec2): void {
  const pts = route.points;
  if (pts.length === 0) {
    pts.push(from, from);
  } else if (needsNewVertex(route, dir)) {
    pts.push(pts[pts.length - 1]!);
  }
  // Otherwise the existing tail segment is extended: it is forward-collinear with dir,
  // or zero-length (its start vertex is then the corner the new travel leaves from).
  recomputeLength(route);
}

/** Move the tail vertex (only outward dash travel calls this). */
export function setTail(route: RouteState, pos: Vec2): void {
  const pts = route.points;
  if (pts.length < 2) throw new Error('setTail on a route without a moving tail');
  pts[pts.length - 1] = pos;
  recomputeLength(route);
}

/** Set the head vertex to the soul's exact position (after a consumption). */
export function setHead(route: RouteState, pos: Vec2): void {
  const pts = route.points;
  if (pts.length < 2) throw new Error('setHead on an empty route');
  pts[0] = pos;
  recomputeLength(route);
}
