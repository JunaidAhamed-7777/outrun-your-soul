/**
 * Flat ground-strip geometry from a simulation polyline (ribbon, shadows, previews).
 * Pure array math so it is unit tested without WebGL. Output is in Three world space
 * via the contract mapping: sim (x, y) at height h -> (x, h, -y).
 *
 * Vertex layout: point i contributes vertex 2i (left of travel) and 2i+1 (right).
 * u = arc length measured from the LAST point backwards (body end of the route), so a
 * pattern stays anchored while the soul consumes the head. v = 0 on the left, 1 on the right.
 */
import type { Vec2 } from '../sim/vec';

export interface StripBuffers {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  /** Maximum number of polyline points the buffers hold. */
  readonly maxPoints: number;
}

export function createStripBuffers(maxPoints: number): StripBuffers {
  return {
    positions: new Float32Array(maxPoints * 2 * 3),
    uvs: new Float32Array(maxPoints * 2 * 2),
    maxPoints,
  };
}

/** Triangle indices for a strip of up to maxPoints points (two triangles per segment). */
export function stripIndices(maxPoints: number): Uint16Array | Uint32Array {
  const count = Math.max(0, maxPoints - 1) * 6;
  const out = maxPoints * 2 > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  for (let i = 0; i < maxPoints - 1; i++) {
    const a = i * 2;
    const o = i * 6;
    out[o] = a;
    out[o + 1] = a + 1;
    out[o + 2] = a + 2;
    out[o + 3] = a + 1;
    out[o + 4] = a + 3;
    out[o + 5] = a + 2;
  }
  return out;
}

/** Miter scale is clamped so hairpin corners do not spike across the floor. */
export const MAX_MITER = 2.2;
const DEDUPE_EPS = 1e-5;

/**
 * Write a strip for `points` into `buf`. Returns the number of points written (0 when the
 * polyline has fewer than two distinct points). Near-duplicate points are skipped.
 */
export function buildStrip(points: readonly Vec2[], halfWidth: number, height: number, buf: StripBuffers): number {
  // Collect distinct points (bounded by buffer capacity, keeping the body end).
  const pts: Vec2[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) < DEDUPE_EPS && Math.abs(last.y - p.y) < DEDUPE_EPS) continue;
    pts.push(p);
  }
  if (pts.length < 2) return 0;
  if (pts.length > buf.maxPoints) pts.splice(0, pts.length - buf.maxPoints);
  const n = pts.length;

  // Arc length from the body end (last point) backwards.
  const arcFromEnd = new Array<number>(n).fill(0);
  for (let i = n - 2; i >= 0; i--) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    arcFromEnd[i] = arcFromEnd[i + 1]! + Math.hypot(b.x - a.x, b.y - a.y);
  }

  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const prev = pts[i - 1];
    const next = pts[i + 1];
    // Unit directions of the incoming and outgoing segments.
    let dinX = 0;
    let dinY = 0;
    let doutX = 0;
    let doutY = 0;
    if (prev) {
      const l = Math.hypot(p.x - prev.x, p.y - prev.y);
      dinX = (p.x - prev.x) / l;
      dinY = (p.y - prev.y) / l;
    }
    if (next) {
      const l = Math.hypot(next.x - p.x, next.y - p.y);
      doutX = (next.x - p.x) / l;
      doutY = (next.y - p.y) / l;
    }
    if (!prev) {
      dinX = doutX;
      dinY = doutY;
    }
    if (!next) {
      doutX = dinX;
      doutY = dinY;
    }
    // Left normals of both segments; the miter direction is their normalised sum.
    const nInX = -dinY;
    const nInY = dinX;
    const nOutX = -doutY;
    const nOutY = doutX;
    let mx = nInX + nOutX;
    let my = nInY + nOutY;
    const ml = Math.hypot(mx, my);
    let scale = 1;
    if (ml < 1e-6) {
      // Full reversal: use the incoming normal.
      mx = nInX;
      my = nInY;
    } else {
      mx /= ml;
      my /= ml;
      const cos = mx * nInX + my * nInY;
      scale = Math.min(MAX_MITER, 1 / Math.max(1e-6, cos));
    }
    const ox = mx * halfWidth * scale;
    const oy = my * halfWidth * scale;
    const vi = i * 2;
    // Left vertex (sim left of travel), then right. Mapping (x, y) -> (x, h, -y).
    buf.positions[vi * 3] = p.x + ox;
    buf.positions[vi * 3 + 1] = height;
    buf.positions[vi * 3 + 2] = -(p.y + oy);
    buf.positions[vi * 3 + 3] = p.x - ox;
    buf.positions[vi * 3 + 4] = height;
    buf.positions[vi * 3 + 5] = -(p.y - oy);
    const u = arcFromEnd[i]!;
    buf.uvs[vi * 2] = u;
    buf.uvs[vi * 2 + 1] = 0;
    buf.uvs[vi * 2 + 2] = u;
    buf.uvs[vi * 2 + 3] = 1;
  }
  return n;
}

export function polylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
