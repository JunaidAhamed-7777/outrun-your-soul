/**
 * Stationary enemy roles.
 *
 * Needler and keeper: each attack is announced (tracking), then locked (aim frozen,
 * attack ID reserved), then fired as a cuttable bolt. Killing a sentry cancels only its
 * unlaunched attack; bolts already in flight persist.
 *
 * Warden: armoured, with a facing that turns slowly toward the body. An outward dash that
 * strikes inside its frontal guard arc is stopped at contact ('guarded'); off-angle it
 * kills. It periodically winds up a short-range sweep over a telegraphed, frozen sector
 * ('locked'), strikes once (fresh attack ID), and is then 'exposed': any angle kills.
 *
 * Timings are paper values from COMBAT_SPEC/CONTENT, not validated difficulty.
 */
import { leadSoul } from './forecast';
import type { EnemyPhase, EnemyRole, EnemySpawn, EnemyState, EntityId, SimState } from './types';
import { normalize, sub, type Vec2 } from './vec';

export interface SentryTuning {
  readonly radius: number;
  /** Idle time between attacks. */
  readonly cooldown: number;
  /** Warning that follows the target before locking. */
  readonly tracking: number;
  /** Locked warning: aim frozen; the bolt will travel exactly this line. */
  readonly locked: number;
  /** Pause after firing before the next cooldown. */
  readonly recover: number;
  readonly boltSpeed: number;
  readonly boltRadius: number;
  readonly target: 'body' | 'soul';
}

export interface WardenTuning {
  readonly radius: number;
  /** Half-width of the frontal guard arc, radians from facing. */
  readonly guardHalfAngle: number;
  /** Maximum turn rate toward the body while idle, radians per second. */
  readonly turnRate: number;
  /** Idle (turning, guarded) time between sweeps. */
  readonly cooldown: number;
  /** Telegraphed windup: the sweep sector is frozen and drawn. */
  readonly windup: number;
  /** Centre-distance reach of the sweep (an endpoint is hit if its circle reaches it). */
  readonly sweepRange: number;
  /** Half-width of the sweep sector, radians from facing. */
  readonly sweepHalfAngle: number;
  /** Opening after the sweep: no guard, any-angle dash kills. */
  readonly exposed: number;
}

const deg = (d: number): number => (d * Math.PI) / 180;

export const ENEMY_TUNING: {
  readonly needler: SentryTuning;
  readonly keeper: SentryTuning;
  readonly warden: WardenTuning;
} = {
  needler: {
    radius: 0.42,
    cooldown: 1.7,
    tracking: 0.9,
    locked: 0.6,
    recover: 0.35,
    boltSpeed: 6,
    boltRadius: 0.15,
    target: 'body',
  },
  // Keepers lead the soul along its route, so their lock and flight are longer than a
  // needler's: the reticle sits well ahead of the soul, leaving a novice RETURN or contact
  // dash time to stop the soul short of it, and a slower bolt to cut.
  keeper: {
    radius: 0.42,
    cooldown: 2.0,
    tracking: 1.1,
    locked: 0.8,
    recover: 0.35,
    boltSpeed: 4.0,
    boltRadius: 0.17,
    target: 'soul',
  },
  // Turn rate is slow enough that a dash around it (~0.2 s plus aim) reaches its flank;
  // the windup is long enough to pull the soul out or strike from behind.
  warden: {
    radius: 0.55,
    guardHalfAngle: deg(60),
    turnRate: deg(30),
    cooldown: 2.4,
    windup: 1.0,
    sweepRange: 2.2,
    sweepHalfAngle: deg(60),
    exposed: 1.6,
  },
};

/** Bolts expire after this long even if they never meet a wall. */
export const BOLT_MAX_AGE = 6;

export function sentryTuning(role: EnemyRole): SentryTuning {
  if (role === 'warden') throw new Error('Wardens fire no bolts; use ENEMY_TUNING.warden');
  return ENEMY_TUNING[role];
}

export function roleRadius(role: EnemyRole): number {
  return ENEMY_TUNING[role].radius;
}

/** Idle (cooldown) length for any role. */
function cooldownFor(role: EnemyRole): number {
  return ENEMY_TUNING[role].cooldown;
}

/** Angle in [0, pi] between two directions. */
export function angleBetween(a: Vec2, b: Vec2): number {
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la === 0 || lb === 0) return 0;
  const c = (a.x * b.x + a.y * b.y) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** True when a strike arriving from `from` hits a warden's armoured front. */
export function wardenGuards(enemy: EnemyState, from: Vec2): boolean {
  if (enemy.role !== 'warden' || enemy.phase === 'exposed' || enemy.phase === 'dead') return false;
  return angleBetween(enemy.facing, sub(from, enemy.pos)) <= ENEMY_TUNING.warden.guardHalfAngle + 1e-12;
}

/** Rotate `facing` toward `goal` by at most `maxTurn` radians (unit result). */
export function turnToward(facing: Vec2, goal: Vec2, maxTurn: number): Vec2 {
  const g = normalize(goal);
  if (g.x === 0 && g.y === 0) return facing;
  const current = Math.atan2(facing.y, facing.x);
  let delta = Math.atan2(g.y, g.x) - current;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  if (Math.abs(delta) <= maxTurn) return g;
  const next = current + Math.sign(delta) * maxTurn;
  return { x: Math.cos(next), y: Math.sin(next) };
}

/** Whether an endpoint circle is inside a warden's sweep sector. */
export function inSweep(enemy: EnemyState, point: Vec2, radius: number): boolean {
  const w = ENEMY_TUNING.warden;
  const rel = sub(point, enemy.pos);
  const d = Math.hypot(rel.x, rel.y);
  if (d > w.sweepRange + radius) return false;
  if (d <= enemy.radius + radius) return true; // pressed against it: always swept
  // Widen the sector edge by the endpoint's angular half-size so a circle grazing it counts.
  const slack = Math.asin(Math.min(1, radius / d));
  return angleBetween(enemy.facing, rel) <= w.sweepHalfAngle + slack;
}

const DEFAULT_FACING: Vec2 = { x: 0, y: -1 };

export function createEnemy(spawn: EnemySpawn, id: EntityId): EnemyState {
  const facing = spawn.facing ? normalize(spawn.facing) : DEFAULT_FACING;
  const dormant = spawn.dormant === true;
  return {
    id,
    key: spawn.id,
    role: spawn.role,
    pos: spawn.at,
    radius: roleRadius(spawn.role),
    phase: dormant ? 'dormant' : 'idle',
    // `phase` is idle time already elapsed at activation; negative delays the first attack.
    phaseTime: dormant ? 0 : (spawn.phase ?? 0),
    phaseDuration: dormant ? Infinity : cooldownFor(spawn.role),
    aim: facing,
    target: spawn.role === 'warden' ? 'body' : sentryTuning(spawn.role).target,
    attackId: null,
    facing,
    aimTarget: null,
    lockTarget: null,
    ...(spawn.role === 'warden'
      ? {
          guardHalfAngle: ENEMY_TUNING.warden.guardHalfAngle,
          sweepRadius: ENEMY_TUNING.warden.sweepRange,
          sweepHalfAngle: ENEMY_TUNING.warden.sweepHalfAngle,
        }
      : {}),
  };
}

/** Wake a dormant sentry into its idle cooldown. */
export function wakeEnemy(enemy: EnemyState, spawn: EnemySpawn | undefined): void {
  enemy.phase = 'idle';
  enemy.phaseTime = spawn?.phase ?? 0;
  enemy.phaseDuration = cooldownFor(enemy.role);
}

export function isActive(phase: EnemyPhase): boolean {
  return (
    phase === 'idle' || phase === 'tracking' || phase === 'locked' || phase === 'recover' || phase === 'exposed'
  );
}

/** Unit aim from a sentry toward a point, keeping the previous aim if degenerate. */
export function aimToward(enemy: EnemyState, point: Vec2): Vec2 {
  const d = sub(point, enemy.pos);
  const n = normalize(d);
  return n.x === 0 && n.y === 0 ? enemy.aim : n;
}

/**
 * The point a sentry aims at if its shot left `delay` seconds from now. A sentry that
 * claimed a Traveler's Knot decoy aims at the decoy. Otherwise needlers take the body's
 * current position (stepping off the line is the counterplay) and keepers lead the soul:
 * its forecast position along the committed route when the bolt would arrive.
 */
export function aimPointFor(state: SimState, enemy: EnemyState, delay: number): Vec2 {
  const relics = state.relicState;
  if (relics?.decoy && relics.decoyClaimedBy === enemy.id) return relics.decoy;
  if (enemy.target === 'body') return state.body.pos;
  const tune = sentryTuning(enemy.role);
  return leadSoul(state, enemy.pos, enemy.radius, tune.boltSpeed, delay);
}
