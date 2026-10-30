/**
 * A deliberately simple greedy player used to prove rooms are completable. It reads
 * only public state and previews, so it exercises the same API the game uses.
 */
import { previewDash, previewReturn } from '../../src/sim';
import type { Command, EnemyState, SimState } from '../../src/sim/types';
import { dist, type Vec2 } from '../../src/sim/vec';

const ANGLES = [0, 15, -15, 30, -30, 50, -50, 75, -75, 100, -100, 135, -135];

function rotate(v: Vec2, degrees: number): Vec2 {
  const r = (degrees * Math.PI) / 180;
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
}

/** Best previewed outward dash toward `goal`, or null if nothing makes progress. */
function bestDashToward(state: SimState, goal: Vec2, minGain: number): Command | null {
  const here = state.body.pos;
  const toGoal = { x: goal.x - here.x, y: goal.y - here.y };
  const d = Math.hypot(toGoal.x, toGoal.y);
  if (d < 1e-6) return null;
  const reach = Math.min(d + 0.6, state.params.dashMaxDistance);
  const base = { x: (toGoal.x / d) * reach, y: (toGoal.y / d) * reach };
  let best: { cmd: Command; remaining: number } | null = null;
  for (const angle of ANGLES) {
    const aim = rotate(base, angle);
    const p = previewDash(state, aim);
    if (!p.valid) continue;
    // Closest approach of the dash segment to the goal (dashes pass through targets).
    const remaining = segmentPointDistance(p.from, p.end, goal);
    if (!best || remaining < best.remaining - 1e-9) best = { cmd: { kind: 'dash', aim }, remaining };
  }
  if (!best || best.remaining > d - minGain) return null;
  return best.cmd;
}

function segmentPointDistance(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2)) : 0;
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y);
}

function nearestAlive(state: SimState): EnemyState | null {
  let best: EnemyState | null = null;
  for (const e of state.enemies) {
    if (e.phase === 'dead' || e.hidden) continue;
    if (!best || dist(e.pos, state.body.pos) < dist(best.pos, state.body.pos)) best = e;
  }
  return best;
}

/** One decision per call; returns null to wait this step. */
export function botCommand(state: SimState): Command | null {
  if (state.outcome !== 'playing') return null;
  const mode = state.body.mode;
  if (mode !== 'ready') return null;
  const separated = state.route.points.length > 0;
  const target = nearestAlive(state);
  const exit = state.room.exit;
  const goal = target ? target.pos : { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
  const inExit =
    !target &&
    state.body.pos.x >= exit.x &&
    state.body.pos.x <= exit.x + exit.w &&
    state.body.pos.y >= exit.y &&
    state.body.pos.y <= exit.y + exit.h;
  if (inExit) return null; // wait for the soul to arrive
  const dashCmd = bestDashToward(state, goal, 0.25);
  if (dashCmd) return dashCmd;
  if (separated && previewReturn(state).valid) return { kind: 'return' };
  return null;
}
