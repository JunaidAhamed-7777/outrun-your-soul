/**
 * Headless planning bot that plays a room through the public simulation API only.
 *
 * Purpose: automated evidence, never gameplay authority.
 *  - winnability: every authored room can be cleared;
 *  - fairness: a player with human aim/reaction delay still has a real response;
 *  - build divergence: different loadouts pick different targets/routes in one room.
 *
 * The bot thinks in "decisions": when the body can act, it enumerates candidate
 * commands (wait, RETURN, dashes on a direction x distance grid), simulates each on a
 * cloned state for a short horizon under a passive follow-up policy, scores the
 * outcome and commits the best. A human-like delay separates deciding from releasing:
 * the world keeps moving while the bot "aims", exactly as it would for a person.
 */
import { createSim, previewDash, stepSim, STEP_SECONDS } from '../sim';
import type { Command, RoomDef, SimEvent, SimOptions, SimState } from '../sim';
import { dist, fromAngle } from '../sim/vec';

export interface BotConfig {
  /** Seconds between deciding and releasing (aiming time). 0 = superhuman. */
  readonly aimDelay: number;
  /** Minimum seconds between two decisions (thinking/reaction cadence). */
  readonly reactionInterval: number;
  /** Lookahead horizon in seconds for scoring a candidate. */
  readonly horizon: number;
  readonly directions: number;
  readonly distances: readonly number[];
  /** Give up after this many simulated seconds. */
  readonly timeLimit: number;
}

export const NOVICE_BOT: BotConfig = {
  aimDelay: 0.4,
  reactionInterval: 0.35,
  horizon: 1.6,
  directions: 16,
  distances: [1.25, 2.25, 3],
  timeLimit: 180,
};

export const EXPERT_BOT: BotConfig = { ...NOVICE_BOT, aimDelay: 0.15, reactionInterval: 0.15 };

export interface BotDecision {
  readonly t: number;
  readonly command: Command | null;
  readonly score: number;
}

export interface BotResult {
  readonly outcome: SimState['outcome'] | 'timeout';
  readonly seconds: number;
  readonly healthLeft: number;
  readonly decisions: readonly BotDecision[];
  /** Enemy authored IDs in kill order: the bot's target priority. */
  readonly killOrder: readonly string[];
  readonly stats: SimState['stats'];
  readonly events: readonly SimEvent[];
  readonly final: SimState;
}

const clone = (s: SimState): SimState => structuredClone(s);

function aliveEnemies(s: SimState) {
  return s.enemies.filter((e) => e.phase !== 'dead');
}

/** Heuristic value of a state; higher is better. Damage dominates, then progress. */
export function scoreState(s: SimState, start: SimState): number {
  if (s.outcome === 'defeat') return -1e6;
  if (s.outcome === 'victory') return 1e6 - s.time;
  let score = 0;
  score -= (start.health - s.health) * 10_000;
  score += (aliveEnemies(start).length - aliveEnemies(s).length) * 600;
  const alive = aliveEnemies(s);
  const separated = s.route.points.length > 0;
  if (alive.length > 0) {
    // Approach the nearest awake-or-dormant target, but not at the cost of a long tether.
    const nearest = Math.min(...alive.map((e) => dist(e.pos, s.body.pos)));
    score -= nearest * 12;
  } else {
    const exit = s.room.exit;
    const cx = exit.x + exit.w / 2;
    const cy = exit.y + exit.h / 2;
    score -= dist({ x: cx, y: cy }, s.body.pos) * 25;
    score -= dist({ x: cx, y: cy }, s.soul.pos) * 15;
  }
  // Outstanding tether is exposure: prefer modest debt, strongly prefer some spare capacity.
  score -= s.route.length * 6;
  if (separated) score -= 15;
  // Bolts heading near either endpoint are danger the horizon may not have resolved yet.
  for (const p of s.projectiles) {
    if (!p.alive) continue;
    for (const target of [s.body.pos, s.soul.pos]) {
      const d = dist(p.pos, target);
      if (d < 1.5) score -= (1.5 - d) * 400;
    }
  }
  return score;
}

/** Candidate commands for the current state (null = keep waiting). */
export function candidates(s: SimState, cfg: BotConfig): (Command | null)[] {
  const out: (Command | null)[] = [null];
  if (s.route.points.length > 0) out.push({ kind: 'return' });
  for (let i = 0; i < cfg.directions; i++) {
    const angle = (i / cfg.directions) * Math.PI * 2;
    for (const d of cfg.distances) {
      const aim = fromAngle(angle, d);
      const preview = previewDash(s, aim);
      if (preview.valid) out.push({ kind: 'dash', aim });
    }
  }
  return out;
}

/** Passive continuation used inside lookahead: wait; RETURN once if a bolt nears the soul. */
function rollout(s: SimState, seconds: number): void {
  const steps = Math.round(seconds / STEP_SECONDS);
  for (let i = 0; i < steps && s.outcome === 'playing'; i++) stepSim(s, []);
}

function evaluate(s: SimState, command: Command | null, cfg: BotConfig): number {
  const sim = clone(s);
  const start = s;
  // The aim delay already elapsed before this decision is released in the real run,
  // so lookahead starts from the release state.
  stepSim(sim, command ? [command] : []);
  rollout(sim, cfg.horizon);
  return scoreState(sim, start);
}

function choose(s: SimState, cfg: BotConfig): { command: Command | null; score: number } {
  let best: { command: Command | null; score: number } = { command: null, score: -Infinity };
  for (const c of candidates(s, cfg)) {
    const score = evaluate(s, c, cfg);
    // Strictly greater keeps the earliest candidate on ties: deterministic.
    if (score > best.score) best = { command: c, score };
  }
  return best;
}

/** True when the body can accept a new action without it being rejected as busy. */
function canAct(s: SimState): boolean {
  return s.outcome === 'playing' && (s.body.mode === 'ready' || s.body.mode === 'return') && s.buffered === null;
}

export function playRoom(room: RoomDef, options: SimOptions, cfg: BotConfig = NOVICE_BOT): BotResult {
  const s = createSim(room, options);
  const decisions: BotDecision[] = [];
  const events: SimEvent[] = [];
  const killOrder: string[] = [];
  let nextThink = 0;
  let pending: { command: Command; releaseAt: number } | null = null;

  while (s.outcome === 'playing' && s.time < cfg.timeLimit) {
    const commands: Command[] = [];
    if (pending && s.time + 1e-9 >= pending.releaseAt) {
      commands.push(pending.command);
      pending = null;
    } else if (!pending && s.time + 1e-9 >= nextThink && canAct(s)) {
      // Decide on a snapshot advanced by the aim delay (the world moves while aiming),
      // but release the decision only after that delay in the real run.
      const future = clone(s);
      rollout(future, cfg.aimDelay);
      const { command, score } = choose(future.outcome === 'playing' ? future : s, cfg);
      decisions.push({ t: s.time, command, score });
      nextThink = s.time + cfg.reactionInterval;
      if (command) pending = { command, releaseAt: s.time + cfg.aimDelay };
    }
    const stepEvents = stepSim(s, commands);
    for (const e of stepEvents) {
      events.push(e);
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
