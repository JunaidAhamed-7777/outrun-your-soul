/**
 * Wall-aware variant of the planning bot (src/bot/bot.ts) for content evidence.
 *
 * The stock bot scores progress by straight-line distance, which is blind to walls: in
 * a U-shaped cloister it parks against the wall nearest a target that is only reachable
 * the long way round. This variant keeps the same configs, candidate generation, human
 * aim delay, stall pressure and reactive second ply, and only replaces distance-to-goal
 * with geodesic distance on the body-clearance grid (Dijkstra over 8-connected nodes
 * whose connecting corridors are wall-clear, the same test the room validator uses).
 */
import { candidates, NOVICE_BOT, type BotConfig, type BotDecision, type BotResult } from '../../src/bot/bot';
import { circleClear, corridorClear } from '../../src/sim/geom';
import { createSim, stepSim, STEP_SECONDS, TUNING } from '../../src/sim';
import type { Command, RoomDef, SimEvent, SimOptions, SimState } from '../../src/sim';
import { dist, type Vec2 } from '../../src/sim/vec';

const GRID = 0.25;

/** Geodesic distance fields toward fixed goals in one room. */
export class NavField {
  private readonly cols: number;
  private readonly rows: number;
  private readonly clear: boolean[];
  private readonly fields = new Map<string, Float64Array>();

  constructor(private readonly room: RoomDef) {
    this.cols = Math.floor(room.width / GRID) + 1;
    this.rows = Math.floor(room.height / GRID) + 1;
    const clearance = TUNING.bodyRadius + TUNING.wallSkin;
    this.clear = [];
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) this.clear.push(circleClear(room, this.node(i, j), clearance));
    }
  }

  private node(i: number, j: number): Vec2 {
    return { x: i * GRID, y: j * GRID };
  }

  private field(goal: Vec2): Float64Array {
    const key = `${goal.x.toFixed(3)},${goal.y.toFixed(3)}`;
    const cached = this.fields.get(key);
    if (cached) return cached;
    const n = this.cols * this.rows;
    const d = new Float64Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    const clearance = TUNING.bodyRadius + TUNING.wallSkin;
    // Seed every clear node with a wall-clear straight line to the goal within 1.5 tiles.
    for (let k = 0; k < n; k++) {
      if (!this.clear[k]) continue;
      const p = this.node(k % this.cols, Math.floor(k / this.cols));
      const g = dist(p, goal);
      if (g <= 1.5 && corridorClear(this.room, p, goal, 0.05)) d[k] = g;
    }
    for (;;) {
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k < n; k++) {
        if (!done[k] && d[k]! < bestD) {
          bestD = d[k]!;
          best = k;
        }
      }
      if (best < 0) break;
      done[best] = 1;
      const i = best % this.cols;
      const j = Math.floor(best / this.cols);
      const p = this.node(i, j);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) continue;
          const nk = nj * this.cols + ni;
          if (!this.clear[nk] || done[nk]) continue;
          const q = this.node(ni, nj);
          const step = Math.hypot(di, dj) * GRID;
          if (bestD + step < d[nk]! && corridorClear(this.room, p, q, clearance)) d[nk] = bestD + step;
        }
      }
    }
    this.fields.set(key, d);
    return d;
  }

  /** Geodesic distance from p to goal; falls back to a penalised straight line. */
  distance(p: Vec2, goal: Vec2): number {
    const f = this.field(goal);
    const i0 = Math.round(p.x / GRID);
    const j0 = Math.round(p.y / GRID);
    let best = Infinity;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
        const v = f[j * this.cols + i]!;
        if (v < Infinity) best = Math.min(best, v + dist(p, this.node(i, j)));
      }
    }
    return best < Infinity ? best : dist(p, goal) + 6;
  }
}

const clone = (s: SimState): SimState => structuredClone(s);
const alive = (s: SimState) => s.enemies.filter((e) => e.phase !== 'dead');

function scoreState(nav: NavField, s: SimState, start: SimState, pressure: number): number {
  if (s.outcome === 'defeat') return -1e6;
  if (s.outcome === 'victory') return 1e6 - s.time;
  let score = 0;
  score -= (start.health - s.health) * 10_000;
  score += (alive(start).length - alive(s).length) * 600;
  const living = alive(s);
  if (living.length > 0) {
    const nearest = Math.min(...living.map((e) => nav.distance(s.body.pos, e.pos)));
    score -= nearest * 12 * pressure;
  } else {
    const exit = s.room.exit;
    const c = { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
    score -= nav.distance(s.body.pos, c) * 25 * pressure;
    score -= nav.distance(s.soul.pos, c) * 15 * pressure;
  }
  score -= s.route.length * 6;
  if (s.route.points.length > 0) score -= 15;
  for (const p of s.projectiles) {
    if (!p.alive) continue;
    for (const target of [s.body.pos, s.soul.pos]) {
      const d = dist(p.pos, target);
      if (d < 1.5) score -= (1.5 - d) * 400;
    }
  }
  return score;
}

function rollout(s: SimState, seconds: number): void {
  const steps = Math.round(seconds / STEP_SECONDS);
  for (let i = 0; i < steps && s.outcome === 'playing'; i++) stepSim(s, []);
}

const canAct = (s: SimState): boolean =>
  s.outcome === 'playing' && (s.body.mode === 'ready' || s.body.mode === 'return') && s.buffered === null;

const STALL_GRACE = 2;
const STALL_RATE = 0.5;
const MAX_PRESSURE = 6;
const SECOND_PLY_PRESSURE = 1.5;
const FOLLOW_UP: BotConfig = { ...NOVICE_BOT, directions: 8, distances: [2.5] };

function evaluate(nav: NavField, s: SimState, c: Command | null, cfg: BotConfig, pressure: number): number {
  const sim = clone(s);
  stepSim(sim, c ? [c] : []);
  if (pressure <= SECOND_PLY_PRESSURE) {
    rollout(sim, cfg.horizon);
    return scoreState(nav, sim, s, pressure);
  }
  rollout(sim, cfg.aimDelay + 0.25);
  if (sim.outcome !== 'playing' || !canAct(sim)) {
    rollout(sim, cfg.horizon);
    return scoreState(nav, sim, s, pressure);
  }
  let best = -Infinity;
  for (const f of candidates(sim, FOLLOW_UP)) {
    const next = clone(sim);
    stepSim(next, f ? [f] : []);
    rollout(next, cfg.horizon);
    best = Math.max(best, scoreState(nav, next, s, pressure));
  }
  return best;
}

export function playRoomNav(room: RoomDef, options: SimOptions, cfg: BotConfig = NOVICE_BOT): BotResult {
  const nav = new NavField(room);
  const s = createSim(room, options);
  const decisions: BotDecision[] = [];
  const events: SimEvent[] = [];
  const killOrder: string[] = [];
  let nextThink = 0;
  let pending: { command: Command; releaseAt: number } | null = null;
  let lastProgress = 0;
  while (s.outcome === 'playing' && s.time < cfg.timeLimit) {
    const commands: Command[] = [];
    if (pending && s.time + 1e-9 >= pending.releaseAt) {
      commands.push(pending.command);
      pending = null;
    } else if (!pending && s.time + 1e-9 >= nextThink && canAct(s)) {
      const future = clone(s);
      rollout(future, cfg.aimDelay);
      const base = future.outcome === 'playing' ? future : s;
      const pressure = Math.min(MAX_PRESSURE, 1 + Math.max(0, s.time - lastProgress - STALL_GRACE) * STALL_RATE);
      let best: { command: Command | null; score: number } = { command: null, score: -Infinity };
      for (const c of candidates(base, cfg)) {
        const score = evaluate(nav, base, c, cfg, pressure);
        if (score > best.score) best = { command: c, score };
      }
      decisions.push({ t: s.time, command: best.command, score: best.score });
      nextThink = s.time + cfg.reactionInterval;
      if (best.command) pending = { command: best.command, releaseAt: s.time + cfg.aimDelay };
    }
    for (const e of stepSim(s, commands)) {
      events.push(e);
      if (e.type === 'kill' || e.type === 'roomCleared') lastProgress = s.time;
      if (e.type === 'kill') {
        const enemy = s.enemies.find((x) => x.id === e.enemyId);
        if (enemy) killOrder.push(enemy.key);
      }
    }
  }
  return {
    outcome: s.outcome === 'playing' ? 'timeout' : s.outcome,
    seconds: s.time,
    healthLeft: s.health,
    decisions,
    killOrder,
    stats: s.stats,
    events,
    final: s,
  };
}
