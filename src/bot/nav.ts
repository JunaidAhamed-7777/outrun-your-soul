/**
 * Wall-aware distance for the planning bot.
 *
 * Straight-line distance is blind to walls: in a U-shaped cloister the bot would park
 * against the wall nearest a target reachable only the long way round. `NavField`
 * returns the straight-line distance whenever a body-wide corridor to the goal is clear
 * (so open rooms score exactly as before) and otherwise a geodesic distance from
 * Dijkstra over an 8-connected grid of body-clear nodes whose links are wall-clear —
 * the same clearance test the room validator uses.
 */
import { circleClear, corridorClear } from '../sim/geom';
import { TUNING } from '../sim/tuning';
import type { RoomDef } from '../sim/types';
import { dist, type Vec2 } from '../sim/vec';

const GRID = 0.25;
/** Goals seed every clear node within this radius that sees them directly. */
const SEED_RADIUS = 1.5;
/** Penalty added when a point is not on the clear grid at all (should not happen in play). */
const OFF_GRID_PENALTY = 6;

interface Edge {
  readonly to: number;
  readonly cost: number;
}

export class NavField {
  private readonly cols: number;
  private readonly rows: number;
  private readonly clear: Uint8Array;
  private readonly edges: Edge[][];
  private readonly fields = new Map<number, Float64Array>();
  private readonly clearance = TUNING.bodyRadius + TUNING.wallSkin;

  constructor(private readonly room: RoomDef) {
    this.cols = Math.floor(room.width / GRID) + 1;
    this.rows = Math.floor(room.height / GRID) + 1;
    const n = this.cols * this.rows;
    this.clear = new Uint8Array(n);
    for (let k = 0; k < n; k++) this.clear[k] = circleClear(room, this.node(k), this.clearance) ? 1 : 0;
    this.edges = [];
    for (let k = 0; k < n; k++) {
      const out: Edge[] = [];
      if (this.clear[k]) {
        const i = k % this.cols;
        const j = Math.floor(k / this.cols);
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) continue;
            const nk = nj * this.cols + ni;
            if (!this.clear[nk]) continue;
            if (corridorClear(room, this.node(k), this.node(nk), this.clearance)) {
              out.push({ to: nk, cost: Math.hypot(di, dj) * GRID });
            }
          }
        }
      }
      this.edges.push(out);
    }
  }

  private node(k: number): Vec2 {
    return { x: (k % this.cols) * GRID, y: Math.floor(k / this.cols) * GRID };
  }

  private nearestKey(p: Vec2): number {
    const i = Math.min(this.cols - 1, Math.max(0, Math.round(p.x / GRID)));
    const j = Math.min(this.rows - 1, Math.max(0, Math.round(p.y / GRID)));
    return j * this.cols + i;
  }

  /** Distance field toward a goal, cached by the goal's nearest grid node. */
  private field(goal: Vec2): Float64Array {
    const key = this.nearestKey(goal);
    const cached = this.fields.get(key);
    if (cached) return cached;
    const anchor = this.node(key);
    const n = this.cols * this.rows;
    const d = new Float64Array(n).fill(Infinity);
    const heap = new MinHeap();
    const reach = Math.ceil(SEED_RADIUS / GRID);
    const gi = key % this.cols;
    const gj = Math.floor(key / this.cols);
    for (let j = Math.max(0, gj - reach); j <= Math.min(this.rows - 1, gj + reach); j++) {
      for (let i = Math.max(0, gi - reach); i <= Math.min(this.cols - 1, gi + reach); i++) {
        const k = j * this.cols + i;
        if (!this.clear[k]) continue;
        const p = this.node(k);
        const g = dist(p, anchor);
        if (g <= SEED_RADIUS && corridorClear(this.room, p, anchor, 0.05)) {
          d[k] = g;
          heap.push(k, g);
        }
      }
    }
    while (heap.size > 0) {
      const [k, dk] = heap.pop();
      if (dk > d[k]!) continue;
      for (const e of this.edges[k]!) {
        const nd = dk + e.cost;
        if (nd < d[e.to]!) {
          d[e.to] = nd;
          heap.push(e.to, nd);
        }
      }
    }
    this.fields.set(key, d);
    return d;
  }

  /** Straight-line distance when a body-wide corridor is clear; geodesic otherwise. */
  distance(p: Vec2, goal: Vec2): number {
    if (corridorClear(this.room, p, goal, this.clearance)) return dist(p, goal);
    const f = this.field(goal);
    const i0 = Math.round(p.x / GRID);
    const j0 = Math.round(p.y / GRID);
    let best = Infinity;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
        const k = j * this.cols + i;
        const v = f[k]!;
        if (v < Infinity) best = Math.min(best, v + dist(p, this.node(k)));
      }
    }
    return Math.max(dist(p, goal), best < Infinity ? best : dist(p, goal) + OFF_GRID_PENALTY);
  }
}

const cache = new WeakMap<RoomDef, NavField>();

/** One NavField per room definition (rooms are immutable data). */
export function navFor(room: RoomDef): NavField {
  let nav = cache.get(room);
  if (!nav) {
    nav = new NavField(room);
    cache.set(room, nav);
  }
  return nav;
}

/** Small binary min-heap of (node, priority). */
class MinHeap {
  private keys: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, p: number): void {
    this.keys.push(key);
    this.prio.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): [number, number] {
    const top: [number, number] = [this.keys[0]!, this.prio[0]!];
    const lastK = this.keys.pop()!;
    const lastP = this.prio.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastK;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.keys.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}
